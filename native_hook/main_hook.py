import asyncio
import websockets
import json
import logging
import subprocess
import base64
import tempfile
import os
import uuid

# Configure logging first
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
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


# Store connected clients
connected_clients = set()

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
        
    return {
        "application_name": app_name,
        "window_title": window_title,
        "bundle_id": bundle_id,
        "pid": pid
    }

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
        sanitized_text = text_to_type.replace("\\", "\\\\").replace(""", "\"")
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

        if focused_element.attributeIsSettable_("AXValue") or focused_element.attributeNames().containsObject_("AXValue"):
            value = focused_element.attributeValue_("AXValue")
            if value is not None:
                logger.debug(f"Focused element raw value type: {type(value)}, value: {str(value)[:100]}")
                if isinstance(value, str):
                    return str(value), None
                elif APPKIT_LOADED and isinstance(value, AppKit.NSAttributedString):
                    return str(value.string()), None 
                elif APPKIT_LOADED and isinstance(value, Foundation.NSObject) and hasattr(value, 'description'):
                    return str(value.description()), None
                else:
                    logger.info(f"Focused element value is not a direct string or common NSObject derivative: {type(value)}")
                    return None, f"Focused element value type not directly string: {type(value)}"
            else:
                logger.info("Focused element has AXValue attribute, but current value is None.")
                return None, "Focused element has AXValue, but it is None."
        else:
            logger.info("Focused element does not have an AXValue attribute.")
            return None, "Focused element does not have AXValue attribute."

    except Exception as e:
        logger.error(f"Error getting focused input text via Accessibility: {e}", exc_info=True)
        is_ax_permission_error = False
        if APPKIT_LOADED: # Check if AppKit is available to even attempt domain check
            # Check for specific error types if AppKit and Foundation are loaded
            # Note: AXErrorDomain is a constant for NSError domain, not a class itself.
            if hasattr(AppKit, 'AXErrorDomainConstant'): # Check if we have a defined constant for the domain
                 if isinstance(e, Foundation.NSError) and e.domain() == AppKit.AXErrorDomainConstant:
                    is_ax_permission_error = True
            elif isinstance(e, Foundation.NSError) and "AXErrorDomain" in e.domain(): # Fallback string check
                 is_ax_permission_error = True

        if is_ax_permission_error or "not allowed to send keystrokes" in str(e).lower() or "accessibility API is not allowed" in str(e).lower() or "accessibility API failed" in str(e).lower() or "AXAPIPermissionError" in str(e):
            return None, "Accessibility API call failed. This may be a permissions issue. Ensure the app running this script has Accessibility access in System Settings."
        return None, f"Exception accessing Accessibility API: {str(e)}"

async def handle_message(websocket, message_str):
    """Handles incoming messages from the CTW web app."""
    message_id = "unknown_id" # Default in case parsing fails early
    command = None
    received_payload = None

    try:
        message = json.loads(message_str)
        # logger.info(f"Received message: {message}") # Can be verbose, use debug if needed
        
        command = message.get("command")
        received_payload = message.get("payload")
        message_id = message.get("id", "unknown_id_after_parse")

        logger.info(f"Processing command: {repr(command)}, ID: {message_id}")

        response = None 

        if command == "ping":
            await websocket.send(json.dumps({
                "id": message_id,
                "type": "pong",
                "original_command": command,
                "status": "success",
                "received_payload": received_payload,
                "payload": "Hello from Python Hook!"
            }))
            logger.debug(f"Sent pong for ID: {message_id}")
            return 

        elif command == "get_active_application_info":
            if APPKIT_LOADED:
                app_info = get_macos_active_window_info()
                response = create_response(message_id, command, received_payload, "success", app_info)
            else:
                response = create_error_response(message_id, command, received_payload, 
                                                 "macOS features (AppKit) are disabled.")
                response["payload"] = get_macos_active_window_info() # Contains N/A fields

        elif command == "trigger_screen_capture":
            image_data, error_msg = capture_screen_to_base64()
            if image_data:
                response = create_response(message_id, command, received_payload, "success", {"imageData": image_data, "format": "png"})
            else:
                response = create_error_response(message_id, command, received_payload, error_msg or "Failed to capture screen")

        elif command == "simulate_keystrokes":
            text_to_type = None
            press_enter_flag = False
            if isinstance(received_payload, dict):
                text_to_type = received_payload.get("text")
                press_enter_flag = received_payload.get("pressEnter", False)
            elif isinstance(received_payload, str):
                text_to_type = received_payload
            
            if text_to_type:
                success, error_msg = simulate_keystrokes_applescript(text_to_type, press_enter_flag)
                if success:
                    response = create_response(message_id, command, received_payload, "success", {"message": "Keystrokes simulated."})
                else:
                    response = create_error_response(message_id, command, received_payload, error_msg or "Failed to simulate keystrokes")
            else:
                response = create_error_response(message_id, command, received_payload, "Missing 'text' in payload for simulate_keystrokes")

        elif command == "get_focused_input_text":
            if not AX_FEATURES_ENABLED:
                 response = create_error_response(message_id, command, received_payload, "macOS Accessibility features are not available.")
            else:
                text_value, error_msg = get_focused_input_text()
                if error_msg:
                    response = create_error_response(message_id, command, received_payload, error_msg)
                else:
                    response = create_response(message_id, command, received_payload, "success", {"focusedText": text_value})
                    logger.debug(f"Successfully retrieved focused text (first 50 chars): '{str(text_value)[:50] if text_value else "None"}', ID: {message_id}")
        else:
            response = create_error_response(message_id, command, received_payload, f"Unknown command: {command}")
            logger.warning(f"Unknown command received: {command}, ID: {message_id}")

        if response:
            await websocket.send(json.dumps(response))
            logger.debug(f"Sent response for command '{command}', ID: {message_id}, Snippet: {json.dumps(response)[:150]}...")

    except json.JSONDecodeError:
        logger.error(f"Invalid JSON received: {message_str}", exc_info=True) 
        # message_id might not be available if JSON is malformed
        await websocket.send(json.dumps({"type": "error", "message": "Invalid JSON format", "id": "json_decode_error"}))
    except Exception as e:
        logger.error(f"Error processing message (ID: {message_id}, Command: {command}): {e}", exc_info=True)
        await websocket.send(json.dumps({"type": "error", "message": f"Server error: {str(e)}", "id": message_id}))

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