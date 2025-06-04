import AppKit
import Foundation # Often needed with AppKit
import objc # For version
import HIServices # Import HIServices
from ApplicationServices import AXIsProcessTrusted

print(f"Python objc version: {objc.__version__}")
print(f"AppKit: {AppKit}")
print(f"Foundation: {Foundation}")
print(f"HIServices: {HIServices}")

try:
    # Try with HIServices first as per the GitHub issue workaround
    if hasattr(HIServices, 'AXUIElementCreateSystemWide'):
        print("SUCCESS: AXUIElementCreateSystemWide found via HIServices.")
        ax_system_wide = HIServices.AXUIElementCreateSystemWide()
        if ax_system_wide:
            print(f"Successfully called AXUIElementCreateSystemWide via HIServices: {ax_system_wide}")
            # Test getting an attribute
            err_code_test, focused_el_test = HIServices.AXUIElementCopyAttributeValue(ax_system_wide, "AXFocusedUIElement", objc.NULL)
            if err_code_test == 0:
                print(f"SUCCESS (test_script): Got AXFocusedUIElement: {focused_el_test}")
            else:
                print(f"FAILURE (test_script): AXUIElementCopyAttributeValue for AXFocusedUIElement failed. Error: {err_code_test}")
        else:
            print("AXUIElementCreateSystemWide (HIServices) exists but call returned None/False (might indicate permission issues later, but found).")
    elif hasattr(AppKit, 'AXUIElementCreateSystemWide'):
        print("INFO: AXUIElementCreateSystemWide found via AppKit (fallback).")
        ax_system_wide = AppKit.AXUIElementCreateSystemWide()
        if ax_system_wide:
            print(f"Successfully called AXUIElementCreateSystemWide via AppKit: {ax_system_wide}")
        else:
            print("AXUIElementCreateSystemWide (AppKit) exists but call returned None/False.")
    else:
        print("FAILURE: AXUIElementCreateSystemWide NOT found via HIServices or AppKit.")
except Exception as e:
    print(f"Error during AXUIElementCreateSystemWide test: {e}")

# Test for another common AX function to be sure
try:
    focused_app = AppKit.NSWorkspace.sharedWorkspace().frontmostApplication()
    if focused_app:
        pid = focused_app.processIdentifier()
        ax_app = None
        # Try with HIServices first
        if hasattr(HIServices, 'AXUIElementCreateApplication'):
            print("INFO: AXUIElementCreateApplication found via HIServices.")
            ax_app = HIServices.AXUIElementCreateApplication(pid)
        elif hasattr(AppKit, 'AXUIElementCreateApplication'):
            print("INFO: AXUIElementCreateApplication found via AppKit (fallback).")
            ax_app = AppKit.AXUIElementCreateApplication(pid)
        else:
            print("FAILURE: AXUIElementCreateApplication NOT found via HIServices or AppKit.")

        if ax_app:
            print(f"Successfully created AXUIElement for app: {focused_app.localizedName()} (PID: {pid}) using available method.")
            # Test getting an attribute from ax_app
            err_code_app_children, children_test = HIServices.AXUIElementCopyAttributeValue(ax_app, "AXChildren", objc.NULL)
            if err_code_app_children == 0:
                print(f"SUCCESS (test_script): Got AXChildren for app (first few): {str(children_test)[:200] if children_test else 'None'}")
            else:
                print(f"FAILURE (test_script): AXUIElementCopyAttributeValue for AXChildren for app failed. Error: {err_code_app_children}")
        elif hasattr(HIServices, 'AXUIElementCreateApplication') or hasattr(AppKit, 'AXUIElementCreateApplication'):
            print(f"Call to create AXUIElement for app {focused_app.localizedName()} returned None/False.")
        # If neither hasattr was true, the earlier "FAILURE" message covers it.
            
    else:
        print("Could not get frontmost application.")
except Exception as e:
    print(f"Error during AXUIElementCreateApplication test: {e}")

if not AXIsProcessTrusted():
    print("Accessibility permissions are not granted.")
    # You can't directly pop up the system dialog to grant from here in most sandboxed script scenarios.
    # It's better to instruct the user how to grant them manually.
    # AXRequestTrustForResponsibleProcess() is often not effective for scripts.
else:
    print("Accessibility permissions are granted.")
