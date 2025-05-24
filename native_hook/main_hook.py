import asyncio
import websockets
import json
import logging
import subprocess
import base64
import tempfile
import os
import uuid
import time
import Quartz # Added to ensure Quartz namespace is available
from Quartz import CGEventCreateMouseEvent, CGEventPost, kCGEventMouseMoved, kCGEventLeftMouseDown, kCGEventLeftMouseUp, kCGEventRightMouseDown, kCGEventRightMouseUp, kCGEventLeftMouseDragged, kCGMouseButtonLeft, kCGMouseButtonRight, CGEventSetType, CGEventSetIntegerValueField, kCGMouseEventClickState # Removed kCGPointZero
from watchdog.observers import Observer
from watchdog.events import FileSystemEventHandler, FileSystemMovedEvent
import collections # For deque
import objc

# Configure logging first
logging.basicConfig(level=logging.DEBUG, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

MACOS_FEATURES_ENABLED = False
APPKIT_LOADED = False
AX_FEATURES_ENABLED = False

try:
    import AppKit
    from AppKit import NSWorkspace, NSRunningApplication
    import Foundation
    APPKIT_LOADED = True
    logger.info("AppKit and Foundation loaded successfully.")

    # Check for Accessibility functions specifically
    if hasattr(AppKit, 'AXUIElementCreateSystemWide'):
        AX_FEATURES_ENABLED = True
        logger.info("AXUIElementCreateSystemWide found. macOS Accessibility features enabled.")
    else:
        logger.warning("AXUIElementCreateSystemWide NOT found via AppKit. Advanced Accessibility features may fail.")
    MACOS_FEATURES_ENABLED = True # If AppKit loaded, basic macOS features are enabled

except ImportError as e:
    logger.warning(f"Critical macOS frameworks (AppKit, Foundation) not found: {e}. All macOS-specific features will be disabled.")
    MACOS_FEATURES_ENABLED = False
    APPKIT_LOADED = False
    AX_FEATURES_ENABLED = False


# --- Local Context History Cache (Hook-Side) ---
MAX_HISTORY_ITEMS = 10 # Max items for each history deque

active_app_history = collections.deque(maxlen=MAX_HISTORY_ITEMS)
# Stores: ({app_name, window_title, bundle_id, pid}, timestamp)

file_event_history = collections.deque(maxlen=MAX_HISTORY_ITEMS)
# Stores: ({event_type, src_path, dest_path, is_directory}, timestamp)

hook_executed_command_history = collections.deque(maxlen=MAX_HISTORY_ITEMS)
# Stores: ({command_type (e.g., 'shell', 'applescript_terminal'), command_details (e.g., actual command string)}, timestamp)

# Store connected clients
connected_clients = set()

# --- File System Event Monitoring --- 
global_observer = None
monitored_paths_details = {} # Store details about paths being monitored, like alias

class AsyncFileSystemEventHandler(FileSystemEventHandler):
    def __init__(self, loop, clients_ref):
        self.loop = loop
        self.clients_ref = clients_ref # Reference to the connected_clients set

    def send_event_to_clients(self, event_type, src_path, dest_path=None, is_directory=False):
        if not self.clients_ref:
            logger.warning("FS Event: No connected clients to send event to.")
            return

        message_payload = {
            "event_type": event_type,
            "src_path": src_path,
            "is_directory": is_directory,
            "timestamp": time.time()
        }
        if dest_path:
            message_payload["dest_path"] = dest_path
        
        message_to_send = {
            "id": f"fs_event_{uuid.uuid4().hex}",
            "type": "file_system_event",
            "status": "success", # FS events are informational, not direct command responses
            "payload": message_payload
        }
        json_message = json.dumps(message_to_send)

        async def send_async():
            # Create a snapshot of clients to iterate over in case the set changes
            current_clients_snapshot = list(self.clients_ref) 
            for client_ws in current_clients_snapshot:
                try:
                    await client_ws.send(json_message)
                    logger.info(f"Sent FS event ({event_type}: {src_path}) to client {client_ws.remote_address}")
                except websockets.exceptions.ConnectionClosed:
                    logger.warning(f"FS Event: Client {client_ws.remote_address} connection closed, couldn't send event.")
                except Exception as e:
                    logger.error(f"FS Event: Error sending to client {client_ws.remote_address}: {e}")
        
        asyncio.run_coroutine_threadsafe(send_async(), self.loop)
        # Add to history cache
        history_entry = {
            "event_type": event_type,
            "src_path": src_path,
            "is_directory": is_directory,
        }
        if dest_path:
            history_entry["dest_path"] = dest_path
        file_event_history.append((history_entry, message_payload["timestamp"])) # Use timestamp from payload

    def on_created(self, event):
        super().on_created(event)
        logger.info(f"FS Event - Created: {'directory' if event.is_directory else 'file'}: {event.src_path}")
        self.send_event_to_clients("created", event.src_path, is_directory=event.is_directory)

    def on_deleted(self, event):
        super().on_deleted(event)
        logger.info(f"FS Event - Deleted: {'directory' if event.is_directory else 'file'}: {event.src_path}")
        self.send_event_to_clients("deleted", event.src_path, is_directory=event.is_directory)

    def on_modified(self, event):
        super().on_modified(event)
        # Avoid duplicate modified events for directories, often noisy
        if not event.is_directory:
            logger.info(f"FS Event - Modified: file: {event.src_path}")
            self.send_event_to_clients("modified", event.src_path, is_directory=event.is_directory)

    def on_moved(self, event):
        super().on_moved(event)
        # Ensure event is an instance of FileSystemMovedEvent to access dest_path safely
        dest_path_val = event.dest_path if isinstance(event, FileSystemMovedEvent) else None
        logger.info(f"FS Event - Moved: {'directory' if event.is_directory else 'file'}: from {event.src_path} to {dest_path_val}")
        self.send_event_to_clients("moved", event.src_path, dest_path=dest_path_val, is_directory=event.is_directory)

# Helper functions for creating standardized responses
def create_response(message_id, original_command, received_payload, status, payload_data):
    return {
        "id": message_id,
        "type": f"{original_command}_response", 
        "original_command": original_command,
        "status": status,
        "received_payload": received_payload,
        "payload": payload_data
    }

def create_error_response(message_id, original_command, received_payload, error_message):
    return {
        "id": message_id,
        "type": f"{original_command}_response", 
        "original_command": original_command,
        "status": "error",
        "received_payload": received_payload,
        "error_message": error_message
    }


def get_macos_active_window_info():
    """Gets information about the frontmost application and its main window on macOS."""
    if not APPKIT_LOADED: # Relies on AppKit
        return {
            "application_name": "N/A (macOS AppKit not available)",
            "window_title": "N/A",
            "bundle_id": "N/A",
            "pid": -1
        }
    
    # Default values in case of an error or if info cannot be obtained
    app_name = "Unknown"
    window_title = "Unknown"
    bundle_id = "Unknown"
    pid = -1

    try:
        workspace = NSWorkspace.sharedWorkspace()
        active_app = workspace.frontmostApplication()
        
        if active_app:
            app_name = active_app.localizedName() or "(Unnamed Application)"
            bundle_id = active_app.bundleIdentifier() or "(No Bundle ID)"
            pid = active_app.processIdentifier()
            window_title = "(Could not determine main window title)" 

            running_app = NSRunningApplication.runningApplicationWithProcessIdentifier_(pid)
            if running_app: # Check if running_app is not None
                if hasattr(running_app, 'mainWindow') and running_app.mainWindow() and hasattr(running_app.mainWindow(), 'title'):
                    window_title = running_app.mainWindow().title() or "(No title for main window)"
                # Fallback to active_app.mainWindow() if running_app.mainWindow() didn't yield title or was None
                elif hasattr(active_app, 'mainWindow') and active_app.mainWindow() and hasattr(active_app.mainWindow(), 'title'): 
                    window_title = active_app.mainWindow().title() or "(No title for main window)"
            elif hasattr(active_app, 'mainWindow') and active_app.mainWindow() and hasattr(active_app.mainWindow(), 'title'):
                # If running_app itself was None, try direct from active_app as a last resort
                window_title = active_app.mainWindow().title() or "(No title for main window)"

    except Exception as e:
        logger.error(f"Error getting macOS active window info: {e}", exc_info=True)
        # Values will remain as the initialized defaults: "Unknown", -1 etc.
        
    app_info_dict = {
        "application_name": app_name,
        "window_title": window_title,
        "bundle_id": bundle_id,
        "pid": pid
    }
    # Add to history
    active_app_history.append((app_info_dict, time.time()))
    return app_info_dict

def capture_screen_to_base64(capture_type="fullscreen", output_dir=None):
    """Captures the screen (or part of it) and returns a base64 encoded image string."""
    if output_dir is None:
        output_dir = tempfile.gettempdir()
    
    os.makedirs(output_dir, exist_ok=True)
    temp_file_path = os.path.join(output_dir, f"ctw_capture_{uuid.uuid4().hex}.png")
    command_args = ["screencapture", "-x", "-C", "-T", "0", "-t", "png", temp_file_path]

    try:
        logger.info(f"Executing screen capture: {' '.join(command_args)}")
        result = subprocess.run(command_args, capture_output=True, text=True, check=True, timeout=10)
        # No need to log stdout/stderr on success, check=True handles non-zero exit
        logger.info(f"Screen capture command executed successfully for {temp_file_path}")

        if os.path.exists(temp_file_path):
            with open(temp_file_path, "rb") as image_file:
                encoded_string = base64.b64encode(image_file.read()).decode('utf-8')
            try:
                os.remove(temp_file_path)
                logger.info(f"Temporary capture file {temp_file_path} removed.")
            except OSError as e:
                logger.warning(f"Could not remove temporary capture file {temp_file_path}: {e}")
            return encoded_string, None
        else:
            logger.error(f"Screen capture command executed but output file {temp_file_path} not found.")
            return None, f"Output file not found after capture: {temp_file_path}"
    except subprocess.CalledProcessError as e:
        logger.error(f"Screen capture failed. Return code: {e.returncode}, Output: {e.output}, Stderr: {e.stderr}")
        return None, f"Screen capture command failed: {e.stderr or e.output or 'Unknown error'}"
    except subprocess.TimeoutExpired:
        logger.error("Screen capture command timed out.")
        return None, "Screen capture command timed out."
    except Exception as e:
        logger.error(f"An unexpected error occurred during screen capture: {e}", exc_info=True)
        return None, f"Unexpected error during screen capture: {str(e)}"
    finally:
        if os.path.exists(temp_file_path):
            try:
                os.remove(temp_file_path)
                logger.info(f"Ensured temporary capture file {temp_file_path} is removed in finally block.")
            except OSError as e:
                logger.warning(f"Could not remove temporary capture file {temp_file_path} in finally: {e}")

def simulate_keystrokes_applescript(text_to_type: str, press_enter: bool = False):
    """Simulates keystrokes using AppleScript, optionally pressing Enter."""
    try:
        sanitized_text = text_to_type.replace("\\", "\\\\").replace('"', '\\"')
        applescript_command = f'tell application "System Events" to keystroke "{sanitized_text}"'
        if press_enter:
            applescript_command += '\nkeystroke return'

        logger.info(f"Executing AppleScript for keystrokes: osascript -e '{applescript_command[:100]}...'")
        result = subprocess.run(["osascript", "-e", applescript_command], capture_output=True, text=True, check=False)
        
        if result.returncode == 0:
            logger.info("Keystroke simulation successful.")
            return True, None
        else:
            error_message = f"AppleScript keystroke command failed with code {result.returncode}: {result.stderr.strip()}"
            logger.error(error_message)
            return False, error_message
    except Exception as e:
        logger.error(f"Exception during keystroke simulation: {e}", exc_info=True)
        return False, str(e)

def get_focused_input_text():
    """Attempts to get text from the currently focused UI element using Accessibility."""
    if not AX_FEATURES_ENABLED:
        return None, "macOS Accessibility features are disabled or AXUIElementCreateSystemWide is not available."

    try:
        system_element = AppKit.AXUIElementCreateSystemWide()
        focused_element_ref = system_element.attributeValue_("AXFocusedUIElement")

        if focused_element_ref is None:
            logger.info("No focused UI element found.")
            return None, "No focused UI element."
        
        focused_element = focused_element_ref

        # Check if AXValue is a valid attribute for the focused element
        # Some elements might not have AXValue but other ways to get text (e.g. AXDescription)
        # For now, focusing on AXValue as it's most common for input fields.
        if focused_element.attributeIsSettable_("AXValue") or focused_element.attributeNames().containsObject_("AXValue"):
            value = focused_element.attributeValue_("AXValue")
            if value is not None:
                logger.debug(f"Focused element raw value type: {type(value)}, value: {str(value)[:100]}")
                if isinstance(value, str):
                    return str(value), None
                elif APPKIT_LOADED and isinstance(value, AppKit.NSAttributedString):
                    return str(value.string()), None 
                elif APPKIT_LOADED and isinstance(value, Foundation.NSObject) and hasattr(value, 'description'):
                    # Fallback for some custom objects that might return their text via description
                    return str(value.description()), None
                else:
                    logger.info(f"Focused element value is not a direct string or common NSObject derivative: {type(value)}")
                    return None, f"Focused element value type not directly string: {type(value)}"
            else:
                logger.info("Focused element has AXValue attribute, but current value is None.")
                return None, "Focused element has AXValue, but it is None."
        else:
            logger.info("Focused element does not have an AXValue attribute.")
            # Consider checking for AXDescription or other attributes as a fallback here if needed in future.
            return None, "Focused element does not have AXValue attribute."

    except Exception as e:
        logger.error(f"Error getting focused input text via Accessibility: {e}", exc_info=True)
        is_ax_permission_error = False
        if APPKIT_LOADED and Foundation: # Ensure Foundation is also checked as it's used for NSError
            if hasattr(AppKit, 'AXErrorDomainConstant'):
                 if isinstance(e, Foundation.NSError) and e.domain() == AppKit.AXErrorDomainConstant:
                    is_ax_permission_error = True
            elif isinstance(e, Foundation.NSError) and "AXErrorDomain" in str(e.domain()): # Check str(e.domain())
                 is_ax_permission_error = True
            # Broader check based on error message content
            error_str = str(e).lower()
            if "accessibility API is not allowed" in error_str or \
               "not allowed to send keystrokes" in error_str or \
               "axapierror" in error_str or \
               "axpermission" in error_str:
                is_ax_permission_error = True

        if is_ax_permission_error:
            return None, "Accessibility API call failed. This may be a permissions issue. Ensure the app running this script has Accessibility access in System Settings."
        return None, f"Exception accessing Accessibility API: {str(e)}"

def execute_shell_command_sync(command_string: str):
    """Executes a shell command synchronously and captures its output."""
    logger.info(f"Executing shell command: {command_string}")
    try:
        # Using shell=True can be a security risk if command_string comes from an untrusted source.
        # For personal use where commands originate from trusted user input in the app, it's more flexible.
        # Consider splitting command_string into a list if shell=False is preferred for safety.
        result = subprocess.run(command_string, shell=True, capture_output=True, text=True, timeout=30) # 30s timeout
        if result.returncode == 0:
            logger.info(f"Shell command successful. stdout: {result.stdout[:100]}...")
            return True, result.stdout, result.stderr
        else:
            logger.warning(f"Shell command failed with code {result.returncode}. stderr: {result.stderr[:100]}... stdout: {result.stdout[:100]}...")
            return False, result.stdout, result.stderr # Return stdout even on failure, it might contain info
    except subprocess.TimeoutExpired:
        logger.error(f"Shell command timed out: {command_string}")
        return False, None, "Command timed out after 30 seconds."
    except Exception as e:
        logger.error(f"Exception executing shell command '{command_string}': {e}", exc_info=True)
        return False, None, None, str(e) # Ensure four values are returned
    finally:
        # Add to history regardless of success/failure, as an attempt was made
        command_details_for_history = {"command_type": "shell_sync", "command": command_string} 
        hook_executed_command_history.append((command_details_for_history, time.time()))

def move_mouse_to(x: int, y: int):
    try:
        move_event = CGEventCreateMouseEvent(None, kCGEventMouseMoved, (x, y), kCGMouseButtonLeft) # Button doesn't matter for move
        CGEventPost(0, move_event)
        logger.info(f"Moved mouse to ({x}, {y})")
        return True, None
    except Exception as e:
        logger.error(f"Error moving mouse: {str(e)}")
        return False, str(e)

def perform_mouse_click(x: int, y: int, button: str = "left", click_type: str = "click"):
    try:
        # Move mouse to position first
        move_mouse_to(x,y)

        if button == "left":
            down_event_type = kCGEventLeftMouseDown
            up_event_type = kCGEventLeftMouseUp
            mouse_button = kCGMouseButtonLeft
        elif button == "right":
            down_event_type = kCGEventRightMouseDown
            up_event_type = kCGEventRightMouseUp
            mouse_button = kCGMouseButtonRight
        else:
            return False, "Invalid mouse button specified"

        num_clicks = 1
        if click_type == "double_click":
            num_clicks = 2
        elif click_type != "click":
            return False, "Invalid click type specified"

        # Create and post mouse down and up events
        # For double click, the clickState needs to be set correctly for each event.
        for i in range(num_clicks):
            down_event = CGEventCreateMouseEvent(None, down_event_type, (x, y), mouse_button)
            if num_clicks > 1:
                 CGEventSetIntegerValueField(down_event, kCGMouseEventClickState, i + 1)
            CGEventPost(0, down_event)
            
            up_event = CGEventCreateMouseEvent(None, up_event_type, (x, y), mouse_button)
            if num_clicks > 1:
                CGEventSetIntegerValueField(up_event, kCGMouseEventClickState, i + 1)
            CGEventPost(0, up_event)
            
            # Small delay for double click to register if needed, though CoreGraphics handles it well typically
            # if num_clicks > 1 and i < num_clicks -1:
            #    time.sleep(0.1) 

        logger.info(f"Performed {click_type} with {button} button at ({x}, {y})")
        return True, None
    except Exception as e:
        logger.error(f"Error performing mouse click: {str(e)}")
        return False, str(e)

def _execute_applescript(script_string: str) -> tuple[bool, str | None]:
    """Helper function to execute an AppleScript string."""
    try:
        logger.info(f"Executing AppleScript: {script_string[:150]}...")
        result = subprocess.run(["osascript", "-e", script_string], capture_output=True, text=True, check=False, timeout=15)
        if result.returncode == 0:
            # stdout might contain results from the script, like tab ID, etc.
            logger.info(f"AppleScript executed successfully. Output: {result.stdout.strip() if result.stdout else 'None'}")
            return True, result.stdout.strip() if result.stdout else None
        else:
            error_message = f"AppleScript failed with code {result.returncode}: {result.stderr.strip() if result.stderr else result.stdout.strip() if result.stdout else 'Unknown osascript error'}"
            logger.error(error_message)
            return False, error_message
    except subprocess.TimeoutExpired:
        logger.error("AppleScript execution timed out.")
        return False, "AppleScript execution timed out after 15 seconds."
    except Exception as e:
        logger.error(f"Exception during AppleScript execution: {e}", exc_info=True)
        return False, str(e)

def run_command_in_new_terminal_tab(command_to_run: str, tab_name: str = None, activate_terminal: bool = True) -> tuple[bool, str | None]:
    """Runs a command in a new Terminal.app tab, optionally naming it."""
    script_parts = []
    if activate_terminal:
        script_parts.append('tell application "Terminal" to activate')
    
    script_parts.append('tell application "System Events" to tell process "Terminal" to keystroke "t" using command down')
    script_parts.append('delay 0.5') # Give time for new tab to open and become active
    
    # It's more reliable to do the command in the new tab after it's created.
    # Setting tab name needs to happen in the context of the new tab.
    # AppleScript's `do script` opens a new window by default if Terminal is not frontmost or no window is open.
    # The keystroke "t" using command down is more reliable for creating a tab in the current window.

    # Script to execute command in the newly created (and supposedly frontmost) tab.
    # Sanitize the command for AppleScript string
    sanitized_command = command_to_run.replace("\\", "\\\\").replace("\"", "\\\"")
    script_parts.append(f'tell application "Terminal" to do script "{sanitized_command}" in selected tab of front window')

    if tab_name:
        sanitized_tab_name = tab_name.replace("\\", "\\\\").replace("\"", "\\\"")
        # Set name of current tab (should be the new one)
        script_parts.append(f'tell application "Terminal" to set custom title of selected tab of front window to "{sanitized_tab_name}"')

    full_script = "\n".join(script_parts)
    # Add to history (command_type: 'applescript_terminal', details: {command_to_run, tab_name})
    command_details_for_history = {"command_type": "applescript_terminal_new_tab", "command": command_to_run, "tab_name": tab_name, "full_script_ približno": full_script[:200]}
    hook_executed_command_history.append((command_details_for_history, time.time()))
    return _execute_applescript(full_script)

async def handle_message(websocket, message_str):
    """Handles incoming messages from the CTW web app."""
    global global_observer # Allow modification of global_observer
    global monitored_paths_details

    try:
        data = json.loads(message_str)
        command = data.get("command")
        payload = data.get("payload")
        message_id = data.get("id") # Crucial: ID of the client's message

        logger.info(f"Received command: {command} with id: {message_id} from {websocket.remote_address}")

        response_data = None
        status = "success"
        error_msg = None

        if command == "ping":
            await websocket.send(json.dumps({
                "id": message_id,
                "type": "pong",
                "original_command": command,
                "status": "success",
                "received_payload": payload,
                "payload": "Hello from Python Hook!"
            }))
            logger.debug(f"Sent pong for ID: {message_id}")
            return 

        elif command == "get_active_application_info":
            if APPKIT_LOADED:
                app_info = get_macos_active_window_info()
                response_data = app_info
            else:
                response_data = get_macos_active_window_info()
                status = "error"
                error_msg = "macOS features (AppKit) are disabled."

        elif command == "trigger_screen_capture":
            image_data, error_msg = capture_screen_to_base64()
            if image_data:
                response_data = {"imageData": image_data, "format": "png"}
            else:
                status = "error"
                error_msg = error_msg or "Failed to capture screen"

        elif command == "simulate_keystrokes":
            text_to_type = None
            press_enter_flag = False
            if isinstance(payload, dict):
                text_to_type = payload.get("text")
                press_enter_flag = payload.get("pressEnter", False)
            elif isinstance(payload, str):
                text_to_type = payload
            
            if text_to_type:
                success, error_msg = simulate_keystrokes_applescript(text_to_type, press_enter_flag)
                if success:
                    response_data = {"message": "Keystrokes simulated."}
                else:
                    status = "error"
                    error_msg = error_msg or "Failed to simulate keystrokes"
            else:
                status = "error"
                error_msg = "Missing 'text' in payload for simulate_keystrokes"

        elif command == "get_focused_input_text":
            if not AX_FEATURES_ENABLED:
                error_msg = "Accessibility features are not enabled on the hook."
                status = "error"
                response_data = {"focusedText": None}
            else:
                text, err = get_focused_input_text()
                if err:
                    error_msg = err
                    status = "error"
                    response_data = {"focusedText": None, "error_message": err} 
                else:
                    response_data = {"focusedText": text}
            # Ensure message_id from the request is used for the response
            if status == "success":
                response = create_response(message_id, command, payload, status, response_data)
            else:
                response = create_error_response(message_id, command, payload, error_msg)

        elif command == "type_in_target_input":
            text_to_type = payload.get("text") if isinstance(payload, dict) else None
            target_app_bundle_id = payload.get("target_app_bundle_id") if isinstance(payload, dict) else None
            status = "error" # Default status
            response_data = {}
            error_msg = None

            if not AX_FEATURES_ENABLED or not APPKIT_LOADED:
                error_msg = "Accessibility or AppKit features are not available on the hook for targeted input."
            elif not text_to_type:
                error_msg = "Missing 'text' in payload for type_in_target_input"
            else:
                activated_app = False
                if target_app_bundle_id:
                    try:
                        apps = AppKit.NSRunningApplication.runningApplicationsWithBundleIdentifier_(target_app_bundle_id)
                        if apps and len(apps) > 0:
                            target_app = apps[0]
                            if target_app.activateWithOptions_(AppKit.NSApplicationActivateIgnoringOtherApps):
                                logger.info(f"Successfully activated application: {target_app_bundle_id}")
                                # Add a small delay to allow the app to activate and focus its input field
                                time.sleep(0.75) # 750ms delay
                                activated_app = True
                            else:
                                error_msg = f"Failed to activate application: {target_app_bundle_id}"
                                logger.warning(error_msg)
                        else:
                            error_msg = f"Application with bundle ID {target_app_bundle_id} not found or not running."
                            logger.warning(error_msg)
                    except Exception as e:
                        error_msg = f"Error activating target application {target_app_bundle_id}: {str(e)}"
                        logger.error(error_msg, exc_info=True)
                else:
                    # No target bundle ID provided, will type into whatever is currently focused globally.
                    activated_app = True # Proceed as if app is ready
                    logger.info("No target_app_bundle_id provided for type_in_target_input, will use current focus.")

                if activated_app and not error_msg:
                    # Now simulate keystrokes. It will go to the focused input in the (now hopefully) active app.
                    success_typing, error_typing = simulate_keystrokes_applescript(text_to_type, False) # pressEnter is false
                    if success_typing:
                        response_data = {"message": f"Text typed into {(target_app_bundle_id or 'current focus')}: {text_to_type[:30]}..."}
                        status = "success"
                    else:
                        error_msg = error_typing or f"Failed to simulate keystrokes in {(target_app_bundle_id or 'current focus')}."
                elif not error_msg: # Should not happen if activated_app is False and no error_msg, but as safeguard
                    error_msg = "App activation step failed without specific error before typing."
            
            if status == "success":
                response = create_response(message_id, command, payload, status, response_data)
            else:
                response = create_error_response(message_id, command, payload, error_msg)

        elif command == "click_button_in_target":
            button_identifier = payload.get("button_identifier")
            target_app_bundle_id = payload.get("target_app_bundle_id")
            response_data = {}
            error_msg = None

            if not AX_FEATURES_ENABLED or not APPKIT_LOADED:
                error_msg = "Accessibility or AppKit features are not available on the hook for targeted click."
            elif not button_identifier:
                error_msg = "Missing 'button_identifier' in payload for click_button_in_target"
            else:
                activated_app = False
                target_app = None
                if target_app_bundle_id:
                    try:
                        apps = AppKit.NSRunningApplication.runningApplicationsWithBundleIdentifier_(target_app_bundle_id)
                        if apps and len(apps) > 0:
                            target_app = apps[0]
                            if target_app:
                                logger.info(f"Attempting to activate {target_app_bundle_id} for click.")
                                if target_app.activateWithOptions_(AppKit.NSApplicationActivateIgnoringOtherApps):
                                    activated_app = True
                                    logger.info(f"Successfully activated {target_app_bundle_id}.")
                                    # Wait a very short moment for the app to come to the front
                                    # This might need adjustment or a more robust way to confirm focus
                                    time.sleep(0.2) 
                                else:
                                    logger.warning(f"Could not activate {target_app_bundle_id} programmatically.")
                                    # error_msg = f"Could not activate target app {target_app_bundle_id}." # Don't error out yet, try system-wide
                            else:
                                logger.warning(f"Target app {target_app_bundle_id} not found or not running.")
                                # error_msg = f"Target app {target_app_bundle_id} not found or not running." # Don't error out
                        else:
                            logger.warning(f"No running applications found with bundle ID {target_app_bundle_id}")
                            # error_msg = f"No running app with bundle ID {target_app_bundle_id}" # Don't error out
                    except Exception as e:
                        logger.error(f"Error trying to activate app {target_app_bundle_id} for click: {e}")
                        # error_msg = f"Error activating app {target_app_bundle_id}: {str(e)}" # Don't error out

                # Placeholder for Accessibility API logic to find and click the button
                # This is the core part that needs to be implemented.
                # For now, it will just log and simulate success if the app was targeted or no specific app was.
                
                clicked_successfully = False
                try:
                    logger.info(f"Attempting to find and click button '{button_identifier}'...")
                    
                    # 1. Get the application element (either the one activated or the system-wide focused one)
                    #    If target_app was activated, use it. Otherwise, get frontmost_app_element.
                    app_element_to_search = None
                    if activated_app and target_app:
                        # How to get AXUIElement from NSRunningApplication?
                        # This needs research. pid = target_app.processIdentifier()
                        # app_element_to_search = AppKit.AXUIElementCreateApplication(target_app.processIdentifier())
                        # logger.info(f"Searching within activated app: {target_app.localizedName()}")
                        # For now, we can't directly get AXUIElement from NSRunningApplication easily.
                        # Fallback to searching in the current frontmost app if specific app was targeted
                        # This is not ideal but a starting point.
                        frontmost_app = AppKit.NSWorkspace.sharedWorkspace().frontmostApplication()
                        if frontmost_app and frontmost_app.bundleIdentifier() == target_app_bundle_id:
                           app_element_to_search = AppKit.AXUIElementCreateApplication(frontmost_app.processIdentifier())
                           logger.info(f"Targeted app {target_app_bundle_id} is frontmost. Searching within it.")
                        else:
                           logger.warning(f"Targeted app {target_app_bundle_id} was activated but is not frontmost. Click might be unreliable. Current frontmost: {frontmost_app.bundleIdentifier() if frontmost_app else 'None'}")
                           # If we can't guarantee the target app is focused for AX search, this will be very unreliable.
                           # For now, we'll let it proceed and it will search in whatever is truly frontmost.
                           # This part needs significant improvement for reliability.
                           system_wide_element = AppKit.AXUIElementCreateSystemWide()
                           error_ref = objc.nullptr # For AXUIElementCopyAttributeValue
                           focused_app_ax_element_ref, err_focused_app_ax = system_wide_element.AXUIElementCopyAttributeValue(AppKit.kAXFocusedApplicationAttribute, error_ref)
                           if err_focused_app_ax or not focused_app_ax_element_ref:
                               pass # Error handled below
                           else:
                               app_element_to_search = focused_app_ax_element_ref # This is actually the AXUIElement of focused app

                    if not app_element_to_search:
                        # Fallback to system-wide focused application if no target or activation failed/unclear
                        logger.info("No specific app targeted or activated for click, or target not frontmost. Getting system-wide focused application.")
                        system_wide_element = AppKit.AXUIElementCreateSystemWide()
                        error_ref = objc.nullptr 
                        focused_app_ax_element_ref, err_focused_app_ax = system_wide_element.AXUIElementCopyAttributeValue(AppKit.kAXFocusedApplicationAttribute, error_ref)
                        if err_focused_app_ax or not focused_app_ax_element_ref:
                            error_msg = "Could not get focused application to search for the button."
                            logger.error(error_msg)
                        else:
                            app_element_to_search = focused_app_ax_element_ref # This is the AXUIElement of the focused app itself
                            # app_name_ref, _ = app_element_to_search.AXUIElementCopyAttributeValue(AppKit.kAXTitleAttribute, error_ref) # Get its name for logging
                            # logger.info(f"Searching for button in focused app: {app_name_ref or 'Unknown'}")
                            
                    if app_element_to_search and not error_msg:
                        # 2. Recursively search for the button within the application element
                        #    This would involve traversing the accessibility hierarchy.
                        #    Looking for elements with kAXRoleAttribute = kAXButtonRole
                        #    And kAXTitleAttribute or kAXDescriptionAttribute matching button_identifier (case-insensitively)
                        
                        button_to_click = _find_ax_element_recursive(
                            app_element_to_search,
                            button_identifier,
                            AppKit.kAXButtonRole
                        )

                        if button_to_click:
                            logger.info(f"Found button '{button_identifier}'. Attempting to click.")
                            # Before clicking, ensure the element is enabled
                            is_enabled_ref, err_enabled = button_to_click.AXUIElementCopyAttributeValue(AppKit.kAXEnabledAttribute, objc.nullptr)
                            if err_enabled: # Error checking enabled status
                                error_msg = f"Could not determine if button '{button_identifier}' is enabled (Error: {err_enabled}). Click aborted."
                                logger.error(error_msg)
                            elif not is_enabled_ref: # Explicitly False
                                error_msg = f"Button '{button_identifier}' was found but is disabled. Click aborted."
                                logger.warning(error_msg)
                            else: # Is enabled or attribute not present (assume enabled)
                                err_press = button_to_click.AXUIElementPerformAction(AppKit.kAXPressAction)
                                if err_press == AppKit.kAXErrorSuccess:
                                    clicked_successfully = True
                                    logger.info(f"Successfully performed kAXPressAction on button '{button_identifier}'.")
                                    response_data["message"] = f"Successfully clicked button '{button_identifier}'."
                                else:
                                    error_msg = f"Found button '{button_identifier}' but failed to perform press action (Error code: {err_press})."
                                    logger.error(error_msg)
                        else:
                            error_msg = f"Button with identifier '{button_identifier}' and role 'AXButton' not found within the application."
                            logger.warning(error_msg)

                except Exception as e_ax:
                    error_msg = f"Accessibility interaction error for click: {str(e_ax)}"
                    logger.error(f"Exception during accessibility phase for click_button_in_target: {e_ax}", exc_info=True)

                if clicked_successfully:
                    status = "success"
                else:
                    status = "error"
                    if not error_msg: # If clicked_successfully is false but no error_msg explicitly set
                        error_msg = f"Button '{button_identifier}' could not be clicked (simulated failure or placeholder)."

            if status == "success":
                response = create_response(message_id, command, payload, status, response_data)

        elif command == "execute_shell_command":
            shell_command_to_run = payload.get("command")
            if shell_command_to_run:
                success, stdout, stderr, error_msg = execute_shell_command_sync(shell_command_to_run)
                response_payload = {
                    "success": success,
                    "stdout": stdout,
                    "stderr": stderr,
                    "error_message": error_msg
                }
                response = {"id": message_id, "type": f"{command}_response", "status": "success" if success else "error", "payload": response_payload, "error_message": error_msg if not success else None}
            else:
                status = "error"
                error_msg = "No command provided in payload"

        elif command == "move_mouse":
            if MACOS_FEATURES_ENABLED:
                x = payload.get("x")
                y = payload.get("y")
                if x is not None and y is not None:
                    success, error_msg = move_mouse_to(x, y)
                    if success:
                        response_data = {"x": x, "y": y}
                    else:
                        status = "error"
                        error_msg = error_msg
                else:
                    status = "error"
                    error_msg = "Missing x or y in payload"
            else:
                status = "error"
                error_msg = "macOS features are disabled on the hook"

        elif command == "mouse_click":
            if MACOS_FEATURES_ENABLED:
                x = payload.get("x")
                y = payload.get("y")
                button = payload.get("button", "left")
                click_type = payload.get("click_type", "click")
                if x is not None and y is not None:
                    success, error_msg = perform_mouse_click(x, y, button, click_type)
                    if success:
                        response_data = {"x": x, "y": y, "button": button, "click_type": click_type}
                    else:
                        status = "error"
                        error_msg = error_msg
                else:
                    status = "error"
                    error_msg = "Missing x or y in payload for mouse_click"
            else:
                status = "error"
                error_msg = "macOS features are disabled on the hook"

        elif command == "start_fs_monitoring":
            if isinstance(payload, dict) and "paths" in payload:
                paths_to_monitor = payload.get("paths")
                recursive_monitor = payload.get("recursive", True)
                path_alias = payload.get("alias", None) # Optional alias for the path

                if isinstance(paths_to_monitor, list) and all(isinstance(p, str) for p in paths_to_monitor):
                    if not global_observer:
                        global_observer = Observer()
                    
                    current_loop = asyncio.get_running_loop()
                    event_handler = AsyncFileSystemEventHandler(current_loop, connected_clients)
                    
                    started_any = False
                    errors_starting = []
                    for path_item in paths_to_monitor:
                        if not os.path.exists(path_item):
                            err_msg = f"Path does not exist: {path_item}"
                            logger.warning(f"FS Monitor Start: {err_msg}")
                            errors_starting.append(err_msg)
                            continue
                        
                        # Avoid duplicate watches on the same path if called multiple times
                        # This simple check might need refinement if complex watch management is needed
                        already_watched = False
                        if global_observer.emitters:
                            for emitter in global_observer.emitters:
                                if hasattr(emitter, 'watch') and emitter.watch.path == path_item:
                                    already_watched = True
                                    logger.info(f"Path {path_item} is already being monitored.")
                                    break
                        if already_watched:
                            continue
                            
                        try:
                            global_observer.schedule(event_handler, path_item, recursive=recursive_monitor)
                            monitored_paths_details[path_item] = {"recursive": recursive_monitor, "alias": path_alias}
                            logger.info(f"Scheduled FS monitoring for path: {path_item}, Recursive: {recursive_monitor}")
                            started_any = True
                        except Exception as e:
                            err_msg = f"Error scheduling watch for {path_item}: {str(e)}"
                            logger.error(err_msg)
                            errors_starting.append(err_msg)

                    if started_any and not global_observer.is_alive():
                        try:
                            global_observer.start()
                            logger.info("File system observer started.")
                        except Exception as e: # Catch potential errors like runtimeerror if already started
                            err_msg = f"Error starting observer: {str(e)}"
                            logger.error(err_msg)
                            errors_starting.append(err_msg)
                            # If observer failed to start, clear it so it can be re-attempted
                            if global_observer:
                                global_observer.stop() # ensure it is stopped if part-started
                                global_observer.join() # wait for it to stop
                            global_observer = None 
                            started_any = False # Reflect that observer is not actually running
                    
                    if errors_starting:
                        response_data = {"message": f"Errors encountered: {'; '.join(errors_starting)}", "stopped_paths": list(monitored_paths_details.keys())}
                        status = "error"
                    elif not started_any and not monitored_paths_details: # Nothing new was started, and nothing was monitored before
                         response_data = {"message": "No new paths were monitored (possibly all already watched or invalid paths)."}
                    else:
                        response_data = {"message": "File system monitoring updated.", "monitored_paths": list(monitored_paths_details.keys())}
                else:
                    status = "error"
                    error_msg = "Invalid 'paths' in payload, expected a list of strings."

            else:
                status = "error"
                error_msg = "Invalid payload for start_fs_monitoring. Expected {paths: [string], recursive?: boolean, alias?: string}."

        elif command == "stop_fs_monitoring":
            paths_to_stop = None
            if isinstance(payload, dict):
                paths_to_stop = payload.get("paths") # Optional: list of specific paths to unwatch
            
            if global_observer and global_observer.is_alive():
                if paths_to_stop and isinstance(paths_to_stop, list):
                    # This requires more complex Watchdog API usage to remove specific watches, 
                    # or unschedule and reschedule remaining. For now, we stop all or specific paths if easy.
                    # Watchdog's Observer doesn't have a simple unschedule_path().
                    # A common pattern is to stop the observer, remove emitters, and restart with remaining watches.
                    # For simplicity in v2.8, if paths are given, we might just clear those from our tracking and they will be ignored.
                    # Or, more simply, if paths_to_stop is given, and it's a non-empty list, we stop the ENTIRE observer for now.
                    # This simplification means you can't selectively unwatch a single directory if multiple are watched.
                    stopped_paths_for_response = []
                    if paths_to_stop:
                        logger.info(f"Requested to stop monitoring for specific paths: {paths_to_stop}. Current implementation will stop ALL monitoring if any paths are specified.")
                        # Simplification: if specific paths are given, we stop all. User can restart for desired subset.
                        global_observer.stop()
                        global_observer.join() # Wait for the thread to finish
                        global_observer = None # Reset observer
                        stopped_paths_for_response = list(monitored_paths_details.keys())
                        monitored_paths_details.clear()
                        msg = f"All file system monitoring stopped (as specific paths {paths_to_stop} were requested to stop)."
                    else: # No paths specified, stop all
                        global_observer.stop()
                        global_observer.join()
                        global_observer = None
                        stopped_paths_for_response = list(monitored_paths_details.keys())
                        monitored_paths_details.clear()
                        msg = "All file system monitoring stopped."
                    response_data = {"message": msg, "stopped_paths": stopped_paths_for_response}
                elif not paths_to_stop: # No specific paths, stop all
                    global_observer.stop()
                    global_observer.join()
                    global_observer = None
                    stopped_paths_for_response = list(monitored_paths_details.keys())
                    monitored_paths_details.clear()
                    msg = "All file system monitoring stopped."
                    response_data = {"message": msg, "stopped_paths": stopped_paths_for_response}
                else:
                     response_data = {"message": "If 'paths' is provided for stop_fs_monitoring, it must be a list of strings."}
            elif global_observer and not global_observer.is_alive():
                # Observer exists but is not alive, perhaps it crashed or was stopped by other means
                logger.info("Stop FS monitoring requested, but observer was found not alive. Cleaning up.")
                global_observer = None # Ensure it's cleared
                monitored_paths_details.clear()
                response_data = {"message": "File system observer was not running. State cleared.", "stopped_paths": []}
            else:
                response_data = {"message": "File system monitoring was not active.", "stopped_paths": []}

        elif command == "terminal_run_in_new_tab":
            if MACOS_FEATURES_ENABLED:
                cmd_to_run = payload.get("command")
                tab_name = payload.get("tab_name")
                activate_term = payload.get("activate_terminal", True)
                if cmd_to_run and isinstance(cmd_to_run, str):
                    success, result_message = run_command_in_new_terminal_tab(cmd_to_run, tab_name, activate_term)
                    if success:
                        response_data = {"message": "Command sent to new terminal tab.", "details": result_message}
                    else:
                        status = "error"
                        error_msg = result_message or "Failed to run command in new terminal tab."
                else:
                    status = "error"
                    error_msg = "Missing or invalid 'command' (string) in payload."
            else:
                status = "error"
                error_msg = "macOS features are disabled on the hook"

        elif command == "get_hook_context_history":
            # Prepare data from deques. Deques store tuples (item, timestamp).
            # We should probably convert them to a more JSON-friendly list of dicts.
            
            def format_history(dq):
                return [{ "item": item_data, "timestamp": ts } for item_data, ts in list(dq)]

            history_payload = {
                "active_app_history": format_history(active_app_history),
                "file_event_history": format_history(file_event_history),
                "hook_executed_command_history": format_history(hook_executed_command_history)
            }
            response_data = history_payload

        elif command == "quit_application":
            if APPKIT_LOADED: # Technically doesn't need AppKit, but good to group macOS features
                bundle_id_to_quit = payload.get("bundle_id")
                app_name_to_quit = payload.get("app_name", "(Unknown App)") # For logging

                if bundle_id_to_quit:
                    logger.info(f"Received request to quit application: {app_name_to_quit} (ID: {bundle_id_to_quit})")
                    success, error_msg_quit = quit_application_applescript(bundle_id_to_quit)
                    if success:
                        response_data = {"message": f"Quit command sent to '{app_name_to_quit}' (ID: {bundle_id_to_quit})."}
                    else:
                        status = "error"
                        error_msg = error_msg_quit or f"Failed to quit application '{app_name_to_quit}' (ID: {bundle_id_to_quit})."
                else:
                    status = "error"
                    error_msg = "Missing 'bundle_id' in payload for quit_application."
            else:
                status = "error"
                error_msg = "macOS features (AppKit check implies general macOS operations) are disabled on the hook."

        else:
            logger.warning(f"Unknown command: {command}")
            status = "error"
            error_msg = f"Unknown command: {command}"

        response = create_response(message_id, command, payload, status, response_data)
        await websocket.send(json.dumps(response))
        logger.info(f"Sent response for command: {command} with id: {message_id} to {websocket.remote_address}")

    except json.JSONDecodeError:
        logger.error("Failed to decode JSON message from client.")
        # If message_id cannot be extracted, generate a new one for this error response
        error_response_id = f"error_{uuid.uuid4().hex}"
        await websocket.send(json.dumps(create_error_response(error_response_id, "unknown", {}, "Invalid JSON format")))
    except Exception as e:
        logger.error(f"Error processing message: {e}", exc_info=True)
        # Attempt to use message_id if available, otherwise generate a new one
        error_response_id = data.get("id", f"error_{uuid.uuid4().hex}") if 'data' in locals() else f"error_{uuid.uuid4().hex}"
        client_command = data.get("command", "unknown") if 'data' in locals() else "unknown"
        client_payload = data.get("payload", {}) if 'data' in locals() else {}
        await websocket.send(json.dumps(create_error_response(error_response_id, client_command, client_payload, str(e))))

async def register(websocket):
    """Registers a new client connection."""
    connected_clients.add(websocket)
    logger.info(f"Client connected: {websocket.remote_address} (Total: {len(connected_clients)})")
    try:
        async for message in websocket:
            await handle_message(websocket, message)
    except websockets.exceptions.ConnectionClosedError as conn_closed_err:
        logger.info(f"Client connection closed (expected): {websocket.remote_address} - {conn_closed_err}")
    except Exception as e:
        logger.error(f"Error during client session {websocket.remote_address}: {e}", exc_info=True)
    finally:
        await unregister(websocket)

async def unregister(websocket):
    """Unregisters a client connection."""
    if websocket in connected_clients:
        connected_clients.remove(websocket)
        logger.info(f"Client disconnected: {websocket.remote_address} (Total: {len(connected_clients)})")
    # else: # No need to log if already removed, might happen with rapid connect/disconnect
        # logger.debug(f"Attempted to unregister client {websocket.remote_address} but not found in connected_clients.")

async def main():
    """Starts the WebSocket server."""
    global global_observer
    loop = asyncio.get_running_loop() # Get current loop for the event handler

    host = "localhost"
    port = 8765

    async with websockets.serve(register, host, port, ping_interval=20, ping_timeout=20):
        logger.info(f"Python Hook WebSocket server started on ws://{host}:{port}")
        await asyncio.Future()  # Run forever

if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        logger.info("Python Hook server shutting down gracefully.")
        if global_observer:
            logger.info("Stopping file system observer...")
            global_observer.stop()
            global_observer.join()
            logger.info("File system observer stopped.")
    except Exception as e:
        logger.critical(f"Python Hook server failed to start or crashed: {e}", exc_info=True)

# Example Message Format (Client to Server):
# {
#   "id": "unique_message_id_string", (e.g., uuidv4())
#   "command": "get_active_window_info", 
#   "payload": { "param1": "value1" } // Optional payload
# }

# Example Message Format (Server to Client - Success):
# {
#   "id": "original_message_id_string",
#   "type": "active_window_info_response", // or "pong", or specific command response type
#   "status": "success", // or "error"
#   "payload": { "data_key": "data_value" } // Response data
# }

# Example Message Format (Server to Client - Error):
# {
#   "id": "original_message_id_string",
#   "type": "error_response", // or specific command error type
#   "status": "error",
#   "error_message": "Details about the error"
# } 

# Global helper function for Accessibility
def _find_ax_element_recursive(current_element, identifier_text, target_role):
    """
    Recursively searches for an AXUIElement starting from current_element.
    Matches based on identifier_text (in title or description) and target_role.
    Returns the AXUIElement if found, otherwise None.
    """
    if not current_element:
        return None

    # Check current element
    error_ref = objc.nullptr 
    
    role_ref, err_role = current_element.AXUIElementCopyAttributeValue(AppKit.kAXRoleAttribute, error_ref)
    
    # If target_role is specified, check it
    if target_role and (err_role or role_ref != target_role):
        pass # Role doesn't match or error getting role, so this element isn't it (unless we are not filtering by role)
    else: # Role matches, or we are not filtering by role. Now check identifier.
        title_ref, err_title = current_element.AXUIElementCopyAttributeValue(AppKit.kAXTitleAttribute, error_ref)
        description_ref, err_desc = current_element.AXUIElementCopyAttributeValue(AppKit.kAXDescriptionAttribute, error_ref)
        
        # Check title (if exists and no error)
        if not err_title and title_ref and isinstance(title_ref, str) and identifier_text.lower() in title_ref.lower():
            logger.debug(f"Found AXElement by title: '{title_ref}' matching '{identifier_text}' with role '{role_ref or 'Any'}'")
            return current_element
        
        # Check description (if exists and no error)
        if not err_desc and description_ref and isinstance(description_ref, str) and identifier_text.lower() in description_ref.lower():
            logger.debug(f"Found AXElement by description: '{description_ref}' matching '{identifier_text}' with role '{role_ref or 'Any'}'")
            return current_element

    # If not found in current element, search children
    children_ref, err_children = current_element.AXUIElementCopyAttributeValue(AppKit.kAXChildrenAttribute, error_ref)
    if not err_children and children_ref:
        for child in children_ref:
            found_element = _find_ax_element_recursive(child, identifier_text, target_role)
            if found_element:
                return found_element
    
    return None 

def quit_application_applescript(bundle_id: str):
    """Gracefully quits an application using its bundle ID via AppleScript."""
    if not bundle_id:
        return False, "Bundle ID is required to quit an application."
    
    # Basic sanitation for bundle_id (AppleScript is generally okay with typical bundle_id chars)
    # but ensure no quotes break the script string.
    sanitized_bundle_id = bundle_id.replace('\"', '\\\"') # Escape double quotes

    applescript_command = f'tell application id "{sanitized_bundle_id}" to quit'
    logger.info(f"Preparing AppleScript to quit application id: {sanitized_bundle_id}")

    try:
        # Using subprocess.run directly similar to simulate_keystrokes_applescript
        result = subprocess.run(["osascript", "-e", applescript_command], capture_output=True, text=True, check=False, timeout=10) # 10s timeout
        
        if result.returncode == 0:
            logger.info(f"AppleScript command to quit '{sanitized_bundle_id}' executed successfully.")
            # Add to history
            history_entry = {
                "command_type": "quit_application_applescript",
                "bundle_id": sanitized_bundle_id,
                "status": "success"
            }
            hook_executed_command_history.append((history_entry, time.time()))
            return True, None
        else:
            error_message = f"AppleScript to quit '{sanitized_bundle_id}' failed. Return code: {result.returncode}. Stderr: {result.stderr.strip() if result.stderr else result.stdout.strip() if result.stdout else 'Unknown osascript error'}"
            logger.error(error_message)
            history_entry = {
                "command_type": "quit_application_applescript",
                "bundle_id": sanitized_bundle_id,
                "status": "error",
                "error_message": error_message
            }
            hook_executed_command_history.append((history_entry, time.time()))
            return False, error_message
    except subprocess.TimeoutExpired:
        error_message = f"AppleScript command to quit '{sanitized_bundle_id}' timed out after 10 seconds."
        logger.error(error_message)
        history_entry = {
            "command_type": "quit_application_applescript",
            "bundle_id": sanitized_bundle_id,
            "status": "error",
            "error_message": error_message
        }
        hook_executed_command_history.append((history_entry, time.time()))
        return False, error_message
    except Exception as e:
        error_message = f"Exception during AppleScript execution for quitting '{sanitized_bundle_id}': {e}"
        logger.error(error_message, exc_info=True)
        history_entry = {
            "command_type": "quit_application_applescript",
            "bundle_id": sanitized_bundle_id,
            "status": "error",
            "error_message": str(e)
        }
        hook_executed_command_history.append((history_entry, time.time()))
        return False, str(e) 