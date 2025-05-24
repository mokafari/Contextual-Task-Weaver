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

# Attempt to import AppKit for macOS specific features
try:
    import AppKit
    NSWorkspace = AppKit.NSWorkspace
    NSRunningApplication = AppKit.NSRunningApplication
    MACOS_FEATURES_ENABLED = True
    logger.info("AppKit loaded successfully. macOS-specific features enabled.")
except ImportError:
    logger.warning("AppKit not found. macOS-specific features (like active app info) will be disabled.")
    MACOS_FEATURES_ENABLED = False

# Store connected clients
connected_clients = set()

def get_macos_active_window_info():
    """Gets information about the frontmost application and its main window on macOS."""
    if not MACOS_FEATURES_ENABLED:
        return {
            "application_name": "N/A (macOS AppKit not available)",
            "window_title": "N/A",
            "bundle_id": "N/A"
        }
    
    workspace = NSWorkspace.sharedWorkspace()
    active_app = workspace.frontmostApplication()
    
    if active_app:
        app_name = active_app.localizedName()
        bundle_id = active_app.bundleIdentifier()
        pid = active_app.processIdentifier()

        # Getting window title is more complex as it requires accessibility or other methods
        # For simplicity, this is a placeholder. A more robust solution would involve AX APIs.
        # This example uses NSRunningApplication to get the main window if available and often works.
        running_app = NSRunningApplication.runningApplicationWithProcessIdentifier_(pid)
        window_title = "(Could not determine main window title)" # Default

        # The following is a common way but might not always get the *main* window title directly or easily.
        # It often relies on the app having a typical window structure and might require Accessibility API for complex apps.
        # For now, we'll keep it simpler and acknowledge this limitation.
        # A more direct way for *some* apps if they are scriptable is via AppleScript.
        
        # Attempting a common, but not always perfect, way to get a window title for the active app.
        # This part can be significantly improved with Accessibility APIs for more reliability.
        # For now, if `mainWindow` is available on `running_app` and has a `title`.
        if hasattr(running_app, 'mainWindow') and running_app.mainWindow() and hasattr(running_app.mainWindow(), 'title'):
             window_title = running_app.mainWindow().title() or "(No title for main window)"
        elif hasattr(active_app, 'mainWindow') and active_app.mainWindow() and hasattr(active_app.mainWindow(), 'title'): # Fallback to active_app if running_app didn't yield it
            window_title = active_app.mainWindow().title() or "(No title for main window)"

        return {
            "application_name": app_name,
            "window_title": window_title,
            "bundle_id": bundle_id,
            "pid": pid
        }
    return {
        "application_name": "Unknown",
        "window_title": "Unknown",
        "bundle_id": "Unknown"
    }

def capture_screen_to_base64(capture_type="fullscreen", output_dir=None):
    """Captures the screen (or part of it) and returns a base64 encoded image string."""
    if output_dir is None:
        output_dir = tempfile.gettempdir()
    
    # Ensure the output directory exists
    os.makedirs(output_dir, exist_ok=True)
    
    temp_file_path = os.path.join(output_dir, f"ctw_capture_{uuid.uuid4().hex}.png")
    
    # Default to fullscreen capture. More options can be added via capture_type or payload.
    # -x: do not play sounds
    # -C: capture the cursor
    # -T 0: no delay (can be parameterized)
    # Using PNG format. JPEGs are smaller but PNG is lossless for UI.
    command_args = ["screencapture", "-x", "-C", "-T", "0", "-t", "png", temp_file_path]

    # Example: To capture a specific window, one might use -l<windowID>
    # Example: To capture interactively, one might use -i
    # These would require more complex payload handling from the client.

    try:
        logger.info(f"Executing screen capture: {' '.join(command_args)}")
        # Increased timeout for screen capture, just in case.
        result = subprocess.run(command_args, capture_output=True, text=True, check=True, timeout=10)
        logger.info(f"Screen capture successful. Output: {result.stdout}, Error: {result.stderr}")

        if os.path.exists(temp_file_path):
            with open(temp_file_path, "rb") as image_file:
                encoded_string = base64.b64encode(image_file.read()).decode('utf-8')
            # Clean up the temporary file
            try:
                os.remove(temp_file_path)
                logger.info(f"Temporary capture file {temp_file_path} removed.")
            except OSError as e:
                logger.warning(f"Could not remove temporary capture file {temp_file_path}: {e}")
            return encoded_string, None  # data, error_message
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
        # Ensure temp file is removed if it exists and something went wrong before removal
        if os.path.exists(temp_file_path):
            try:
                os.remove(temp_file_path)
                logger.info(f"Ensured temporary capture file {temp_file_path} is removed in finally block.")
            except OSError as e:
                logger.warning(f"Could not remove temporary capture file {temp_file_path} in finally: {e}")

def simulate_keystrokes_applescript(text_to_type: str, press_enter: bool = False):
    """Simulates keystrokes using AppleScript, optionally pressing Enter."""
    try:
        # Sanitize the text for AppleScript string literals
        sanitized_text = text_to_type.replace("\\\\", "\\\\\\\\").replace("\"", "\\\"")
        
        applescript_command = f'tell application "System Events" to keystroke "{sanitized_text}"'
        if press_enter:
            applescript_command += '\\nkeystroke return' # Using \\n to ensure it's a new line in the tell block for clarity, then keystroke return

        logger.info(f"Executing AppleScript for keystrokes: osascript -e '{applescript_command[:100]}...'")
        
        result = subprocess.run(["osascript", "-e", applescript_command], capture_output=True, text=True, check=False)
        
        if result.returncode == 0:
            logger.info("Keystroke simulation successful.")
            return True, None
        else:
            error_message = f"AppleScript keystroke command failed: {result.stderr.strip()}"
            logger.error(f"Keystroke simulation failed. Return code: {result.returncode}, Error: {result.stderr.strip()}")
            return False, error_message
    except Exception as e:
        logger.error(f"Exception during keystroke simulation: {e}")
        return False, str(e)

async def handle_message(websocket, message_str):
    """Handles incoming messages from the CTW web app."""
    try:
        message = json.loads(message_str)
        logger.info(f"Received message: {message}")
        
        command = message.get("command")
        payload = message.get("payload")
        message_id = message.get("id")

        # Diagnostic print
        logger.info(f"DIAGNOSTIC: Received command: {repr(command)}")
        # We can remove or comment out the next diagnostic line if no longer needed
        # logger.info(f"DIAGNOSTIC: Comparing with: {repr("get_active_application_info")}")

        response = {
            "type": "ack", # Default type, will be overridden by specific handlers
            "original_command": command,
            "status": "received", # Default status
            "received_payload": payload,
            "id": message_id 
        }

        if command == "ping":
            response["type"] = "pong"
            response["status"] = "success"
            response["payload"] = "Hello from Python Hook!"

        elif command == "get_active_application_info":
            if MACOS_FEATURES_ENABLED:
                app_info = get_macos_active_window_info()
                response["type"] = "active_application_info_response"
                response["status"] = "success"
                response["payload"] = app_info
            else:
                response["type"] = "active_application_info_response"
                response["status"] = "error"
                response["error_message"] = "macOS features are disabled because AppKit could not be imported."
                response["payload"] = get_macos_active_window_info() # Returns N/A info

        elif command == "trigger_screen_capture":
            logger.info("Processing trigger_screen_capture command...")
            image_data, error_msg = capture_screen_to_base64()
            if image_data:
                response["type"] = "screen_capture_response"
                response["status"] = "success"
                response["payload"] = {"imageData": image_data, "format": "png"}
                logger.info("Screen capture successful, sending base64 image data.")
            else:
                response["type"] = "screen_capture_response"
                response["status"] = "error"
                response["error_message"] = error_msg or "Failed to capture screen"
                response["payload"] = None
                logger.error(f"Screen capture failed: {error_msg}")

        elif command == "simulate_keystrokes":
            text_to_type = None
            press_enter_flag = False
            if isinstance(payload, dict):
                text_to_type = payload.get("text")
                press_enter_flag = payload.get("pressEnter", False)
            elif isinstance(payload, str): # Legacy: direct string payload
                text_to_type = payload
            
            if text_to_type:
                logger.info(f"Processing simulate_keystrokes command with text: '{text_to_type[:30]}...', pressEnter: {press_enter_flag}")
                success, error_msg = simulate_keystrokes_applescript(text_to_type, press_enter_flag)
                if success:
                    response["type"] = "keystroke_simulation_response"
                    response["status"] = "success"
                    response["payload"] = {"message": "Keystrokes simulated."}
                    logger.info("Keystroke simulation successful.")
                else:
                    response["type"] = "keystroke_simulation_response"
                    response["status"] = "error"
                    response["error_message"] = error_msg or "Failed to simulate keystrokes"
                    logger.error(f"Keystroke simulation failed: {error_msg}")
            else:
                response["type"] = "keystroke_simulation_response"
                response["status"] = "error"
                response["error_message"] = "Missing 'text' in payload for simulate_keystrokes"
                logger.warning("Simulate_keystrokes command missing text in payload.")

        # Add more command handlers here as we build features
        else:
            response["type"] = "unknown_command_response"
            response["status"] = "error"
            response["error_message"] = f"Unknown command: {command}"
            logger.warning(f"Unknown command received: {command}")

        await websocket.send(json.dumps(response))
        logger.info(f"Sent response for command '{command}': {json.dumps(response)[:200]}...") # Log snippet

    except json.JSONDecodeError:
        logger.error(f"Invalid JSON received: {message_str}")
        await websocket.send(json.dumps({"type": "error", "message": "Invalid JSON format", "id": message_id if 'message_id' in locals() else None}))
    except Exception as e:
        logger.error(f"Error processing message: {e}", exc_info=True)
        await websocket.send(json.dumps({"type": "error", "message": f"Server error: {str(e)}", "id": message_id if 'message_id' in locals() else None}))

async def register(websocket):
    """Registers a new client connection."""
    connected_clients.add(websocket)
    logger.info(f"Client connected: {websocket.remote_address}")
    try:
        async for message in websocket:
            await handle_message(websocket, message)
    except websockets.exceptions.ConnectionClosedError:
        logger.info(f"Client connection closed error: {websocket.remote_address}")
    except Exception as e:
        logger.error(f"Error during client session: {e}", exc_info=True)
    finally:
        await unregister(websocket)

async def unregister(websocket):
    """Unregisters a client connection."""
    connected_clients.remove(websocket)
    logger.info(f"Client disconnected: {websocket.remote_address}")

async def main():
    """Starts the WebSocket server."""
    host = "localhost"
    port = 8765
    # global uuid # uuid is imported at the top level now

    async with websockets.serve(register, host, port):
        logger.info(f"Python Hook WebSocket server started on ws://{host}:{port}")
        await asyncio.Future()  # Run forever

if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        logger.info("Python Hook server shutting down.")
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