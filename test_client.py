import asyncio
import websockets
import json
import uuid
import base64 # For decoding screen capture
import os # For saving screen capture

# URI of the WebSocket server
URI = "ws://localhost:8765"

async def send_command(command_name, payload=None):
    """Helper function to send a command and print request/response."""
    # Increase max_size to accommodate potentially large screen capture data (e.g., 5MB)
    max_websocket_message_size = 5 * 1024 * 1024 
    async with websockets.connect(URI, max_size=max_websocket_message_size) as websocket:
        message_id = str(uuid.uuid4())
        message = {
            "id": message_id,
            "command": command_name,
        }
        if payload is not None:
            message["payload"] = payload
        
        await websocket.send(json.dumps(message))
        print(f"\n>>> Sent command: {command_name}, ID: {message_id}")
        print(f"Payload: {json.dumps(payload, indent=2)}")

        response_str = await websocket.recv()
        response_json = json.loads(response_str)
        print(f"<<< Received response for {command_name} (ID: {message_id}):")
        print(json.dumps(response_json, indent=2))
        return response_json

async def test_ping():
    print("--- Testing Ping ---")
    await send_command("ping", {"data": "hello from client"})

async def test_get_active_app():
    print("\n--- Testing Get Active Application Info ---")
    await send_command("get_active_application_info")

async def test_screen_capture():
    print("\n--- Testing Trigger Screen Capture ---")
    response = await send_command("trigger_screen_capture")
    if response and response.get("status") == "success":
        payload = response.get("payload", {})
        image_data_b64 = payload.get("imageData")
        if image_data_b64:
            try:
                # Print only a snippet of the base64 data
                snippet = image_data_b64[:100] + "..."
                print(f"Received image data (snippet): {snippet}")
                print(f"Image data length: {len(image_data_b64)} bytes")
                
                image_data_bytes = base64.b64decode(image_data_b64)
                capture_path = "test_capture.png"
                with open(capture_path, "wb") as f:
                    f.write(image_data_bytes)
                print(f"Screen capture saved to: {os.path.abspath(capture_path)}")
            except Exception as e:
                print(f"Error processing screen capture data: {e}")
        else:
            print("Screen capture success, but no image data in payload.")
    elif response and response.get("status") == "error":
        print(f"Screen capture failed: {response.get('error_message')}")
    else:
        print("Screen capture response not in expected format or no response.")


async def test_keystrokes():
    print("\n--- Testing Simulate Keystrokes ---")
    print("Ensure a text input field is active before this test runs.")
    print("Will type 'Hello from CTW!' and press Enter in 5 seconds...")
    await asyncio.sleep(5)
    payload = {"text": "Hello from CTW!", "pressEnter": True}
    await send_command("simulate_keystrokes", payload)

async def test_shell_command():
    print("\n--- Testing Execute Shell Command ---")
    # Example: list files in the current directory (of the hook)
    # Be cautious with the commands you test here.
    payload = {"command": "ls -la"} 
    await send_command("execute_shell_command", payload)
    
    print("\n--- Testing Execute Shell Command (Example with error) ---")
    payload_error = {"command": "nonexistentcommand123"}
    await send_command("execute_shell_command", payload_error)


async def test_hook_history():
    print("\n--- Testing Get Hook Context History ---")
    await send_command("get_hook_context_history")

FS_TEST_DIR = "/Users/gustav/Downloads/ctw-fs-test-dir"
FS_TEST_FILE = os.path.join(FS_TEST_DIR, "test_file.txt")

async def test_fs_monitoring():
    print("\n--- Testing File System Monitoring ---")
    
    # Ensure the test directory exists
    os.makedirs(FS_TEST_DIR, exist_ok=True)
    print(f"Test directory: {FS_TEST_DIR}")

    start_payload = {"paths": [FS_TEST_DIR], "recursive": True, "alias": "ctw_test_dir"}
    await send_command("start_fs_monitoring", start_payload)

    print(f"\nACTION REQUIRED: Please manually create, modify, or delete a file in {FS_TEST_DIR} within the next 15 seconds.")
    print(f"For example, create a file: echo \"hello\" > {FS_TEST_FILE}")
    print(f"Then, modify it: echo \"world\" >> {FS_TEST_FILE}")
    print(f"Then, delete it: rm {FS_TEST_FILE}")
    await asyncio.sleep(15) # Give time for manual interaction

    print("\n--- Checking Hook History for FS Events ---")
    # This will show if the server captured any FS events in its internal history
    await test_hook_history() 

    stop_payload = {"paths": [FS_TEST_DIR]} # Stop monitoring the specific path
    # Or use {} to stop all monitoring: stop_payload = {}
    await send_command("stop_fs_monitoring", stop_payload)
    
    # Clean up the test directory if it's empty, otherwise leave it for inspection
    try:
        if not os.listdir(FS_TEST_DIR):
            os.rmdir(FS_TEST_DIR)
            print(f"Cleaned up empty test directory: {FS_TEST_DIR}")
        else:
            print(f"Test directory {FS_TEST_DIR} not empty, not removed.")
    except OSError as e:
        print(f"Error cleaning up test directory: {e}")

async def test_mouse_controls():
    print("\n--- Testing Mouse Controls ---")
    print("Will move mouse to (100,100) and click in 3 seconds...")
    await asyncio.sleep(3)
    await send_command("move_mouse", {"x": 100, "y": 100})
    await send_command("mouse_click", {"x": 100, "y": 100, "button": "left", "click_type": "click"})

async def test_accessibility_features():
    print("\n--- Testing Accessibility Features ---")
    print("WARNING: These tests may fail if macOS Accessibility features are not correctly configured or available for the hook.")

    print("\nEnsure a text input field is active for 'get_focused_input_text' in 3 seconds...")
    await asyncio.sleep(3)
    await send_command("get_focused_input_text")

    print("\nEnsure TextEdit.app is running for target tests.")
    print("Attempting to type into TextEdit in 3 seconds...")
    await asyncio.sleep(3)
    type_payload = {
        "target_app_bundle_id": "com.apple.TextEdit", 
        "text": "Hello from CTW into TextEdit!"
    }
    await send_command("type_in_target_input", type_payload)

    # Note: Finding a universally reliable button_identifier for TextEdit without inspection is hard.
    # This part of the test is more about sending the command.
    # Common button titles could be "New Document", or specific to a dialog if one was open.
    # Let's try with a common system dialog button name if TextEdit was trying to close an unsaved doc.
    # This is very speculative.
    print("\nAttempting to click a button in TextEdit (speculative) in 3 seconds...")
    await asyncio.sleep(3)
    click_payload = {
        "target_app_bundle_id": "com.apple.TextEdit",
        "button_identifier": "Don't Save" # Example: if an unsaved document dialog is up
                                         # If not, this will likely report 'button not found'.
    }
    # A safer alternative might be to try clicking a menu item if that functionality was available.
    # For now, we stick to button_identifier based on what the hook provides.
    await send_command("click_button_in_target", click_payload)

async def test_terminal_new_tab():
    print("\n--- Testing Terminal Run in New Tab ---")
    print("Will attempt to open a new Terminal tab and run 'echo Hello from CTW' in 3 seconds...")
    await asyncio.sleep(3)
    payload = {"command": "echo Hello from CTW in a new Terminal tab", "tab_name": "CTW Test Tab", "activate_terminal": True}
    await send_command("terminal_run_in_new_tab", payload)

async def test_quit_application():
    print("\n--- Testing Quit Application ---")
    print("WARNING: This will attempt to quit TextEdit.app. Ensure no unsaved work.")
    print("Attempting to quit TextEdit.app in 5 seconds...")
    await asyncio.sleep(5)
    # To be safe, let's first launch TextEdit to ensure it's running, then quit it.
    # This makes the test more self-contained if TextEdit wasn't already running.
    # However, the hook doesn't have a 'launch_app' command. So user must ensure it's running or test fails gracefully.
    # For now, we assume TextEdit might be running. If not, quit will likely report an error for app not running.
    payload = {"bundle_id": "com.apple.TextEdit", "app_name": "TextEdit"}
    await send_command("quit_application", payload)

async def main():
    # Always good to start with a ping
    await test_ping() 
    
    #Uncomment the tests you want to run:
    await test_get_active_app()
    # await test_screen_capture()
    # await test_keystrokes() # Be ready for this, it will type!
    # await test_shell_command()
    # await test_hook_history()
    # await test_fs_monitoring()
    # await test_mouse_controls()
    await test_accessibility_features()
    # await test_terminal_new_tab()
    # await test_quit_application()

    # Example of how to test file system monitoring start (requires paths on the machine running the hook)
    # print("\n--- Testing Start FS Monitoring ---")
    # fs_payload_start = {
    #     "paths": ["/Users/gustav/Downloads/test-monitor"], # REPLACE WITH A VALID PATH ON YOUR SYSTEM
    #     "recursive": True,
    #     "alias": "test_monitoring_dir"
    # }
    # Make sure the path exists before running, e.g., by creating it:
    # os.makedirs(fs_payload_start["paths"][0], exist_ok=True) 
    # await send_command("start_fs_monitoring", fs_payload_start)
    
    # print("\n--- Testing Stop FS Monitoring ---")
    # fs_payload_stop = {} # Stop all
    # await send_command("stop_fs_monitoring", fs_payload_stop)


if __name__ == "__main__":
    asyncio.run(main()) 