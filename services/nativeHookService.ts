import { v4 as uuidv4 } from 'uuid';
import { logger } from './logger';
import {
  HookMessage,
  MacOSActiveApplicationInfo, // Assuming this is still used or needed
  ScreenCaptureResponsePayload, // Assuming this is still used or needed
  KeystrokePayload, 
  FocusedInputTextPayload, // Assuming this is still used or needed
  ShellCommandPayload,
  MouseMovePayload, 
  MouseClickPayload,
  StartFSMonitoringPayload, // Added
  StopFSMonitoringPayload,   // Added
  TerminalRunInNewTabPayload, // Added
  HookContextHistoryPayload, // Added for response type hint, though not strictly for sending
  TypeInTargetInputPayload,
  ClickButtonInTargetPayload,
  QuitApplicationPayload,
  DefaultResponsePayload
} from '../types'; // Adjust path as necessary

const HOOK_SERVICE_NAME = "NativeHookService";
const HOOK_WEBSOCKET_URL = "ws://localhost:8765";
const RECONNECT_INTERVAL_MS = 5000;

// Local interface for messages sent TO the hook
interface ClientSentMessage {
  id: string;
  command: string;
  payload?: any;
}

interface NativeHookServiceInterface {
  connect: () => void;
  disconnect: () => void;
  sendMessage: (command: string, payload?: any) => Promise<HookMessage | null>;
  getHookStatus: () => HookStatus;
  onStatusChange: (callback: (status: HookStatus) => void) => void;
  onMessage: (callback: (message: HookMessage) => void) => void;
  removeStatusListener: (callback: (status: HookStatus) => void) => void;
  removeMessageListener: (callback: (message: HookMessage) => void) => void;
  sendSimulateKeystrokes: (text: string, pressEnter: boolean) => Promise<HookMessage | null>;
  sendGetFocusedInputText: () => Promise<HookMessage | null>;
  sendShellCommand: (command: string) => Promise<HookMessage | null>;
  sendMouseMove: (x: number, y: number) => Promise<HookMessage | null>;
  sendMouseClick: (x: number, y: number, button: "left" | "right", clickType: "click" | "double_click") => Promise<HookMessage | null>;
  sendStartFSMonitoring: (paths: string[], recursive?: boolean, alias?: string) => Promise<HookMessage | null>;
  sendStopFSMonitoring: (paths?: string[]) => Promise<HookMessage | null>;
  sendTerminalRunInNewTab: (command: string, tabName?: string, activateTerminal?: boolean) => Promise<HookMessage | null>;
  sendQuitApplication: (payload: QuitApplicationPayload) => Promise<HookMessage | null>;
  sendGetHookContextHistory: () => Promise<HookMessage | null>;
  sendTypeInTargetInput: (text: string, targetAppBundleId?: string) => Promise<HookMessage | null>;
  sendClickButtonInTarget: (buttonIdentifier: string, targetAppBundleId?: string) => Promise<HookMessage | null>;
  getIsConnected: () => boolean;
}

export class NativeHookService implements NativeHookServiceInterface {
  private websocket: WebSocket | null = null;
  private status: HookStatus = HookStatus.INITIALIZING; // Use enum member
  private statusChangeListeners: Array<(status: HookStatus) => void> = [];
  private messageListeners: Array<(message: HookMessage) => void> = [];
  private reconnectTimer: NodeJS.Timeout | null = null;
  private pendingRequests: Map<string, { 
    resolve: (response: HookMessage) => void; 
    reject: (error: Error) => void; 
    timeoutId: NodeJS.Timeout; 
  }> = new Map();
  private isConnected: boolean = false;

  constructor() {
    this.connect = this.connect.bind(this);
    this.disconnect = this.disconnect.bind(this);
    this.sendMessage = this.sendMessage.bind(this);
  }

  private setStatus(newStatus: HookStatus) {
    if (this.status === newStatus) return;
    this.status = newStatus;
    logger.info(HOOK_SERVICE_NAME, "setStatus", `Status changed: ${newStatus}`);
    this.statusChangeListeners.forEach(cb => cb(this.status));
  }

  connect() {
    if (this.websocket && (this.websocket.readyState === WebSocket.OPEN || this.websocket.readyState === WebSocket.CONNECTING)) {
      logger.info(HOOK_SERVICE_NAME, "connect", "Connection attempt already in progress or established.");
      return;
    }

    this.clearReconnectTimer();
    this.setStatus(HookStatus.CONNECTING); // Use enum member
    logger.info(HOOK_SERVICE_NAME, "connect", `Attempting to connect to Native Hook at ${HOOK_WEBSOCKET_URL}...`);

    try {
      this.websocket = new WebSocket(HOOK_WEBSOCKET_URL);

      this.websocket.onopen = () => {
        this.setStatus(HookStatus.CONNECTED); // Use enum member
        this.clearReconnectTimer();
        logger.info(HOOK_SERVICE_NAME, "onopen", "Successfully connected to Native Hook.");
        this.isConnected = true;
      };

      this.websocket.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data as string) as HookMessage; // Expecting HookMessage from server
          logger.debug(HOOK_SERVICE_NAME, "onmessage", "Received message from hook:", message);
          
          const promiseCallbacks = this.pendingRequests.get(message.id); // message.id should be the original request ID
          if (promiseCallbacks) {
            clearTimeout(promiseCallbacks.timeoutId); // Clear the timeout
            if (message.status === 'success') {
              promiseCallbacks.resolve(message);
            } else {
              promiseCallbacks.reject(new Error(message.error_message || `Hook command '${message.original_command}' failed.`));
            }
            this.pendingRequests.delete(message.id);
          } else {
            // If not a direct response to a pending request, pass to general message listeners
            this.messageListeners.forEach(cb => cb(message));
          }

        } catch (error) {
          logger.error(HOOK_SERVICE_NAME, "onmessage", "Error parsing message from hook:", error, event.data);
        }
      };

      this.websocket.onclose = (event) => {
        logger.warn(HOOK_SERVICE_NAME, "onclose", `Disconnected from Native Hook. Code: ${event.code}, Reason: ${event.reason || 'N/A'}. Clean close: ${event.wasClean}`);
        this.setStatus(this.status === HookStatus.CONNECTING ? HookStatus.ERROR : HookStatus.DISCONNECTED); // Use enum members
        this.websocket = null;
        this.attemptReconnect();
        this.isConnected = false;
      };

      this.websocket.onerror = (error) => {
        logger.error(HOOK_SERVICE_NAME, "onerror", "Native Hook WebSocket error:", error);
        if (this.status !== HookStatus.DISCONNECTED) { 
            this.setStatus(HookStatus.ERROR); // Use enum member
        }
      };
    } catch (error) {
        logger.error(HOOK_SERVICE_NAME, "connect", "Error initiating WebSocket connection:", error);
        this.setStatus(HookStatus.ERROR); // Use enum member
        this.attemptReconnect();
    }
  }

  private attemptReconnect() {
    if (this.reconnectTimer) return;
    if (this.status === HookStatus.CONNECTING) return; // Check with enum member
    
    this.setStatus(HookStatus.RECONNECTING); // Use enum member
    logger.info(HOOK_SERVICE_NAME, "attemptReconnect", `Will attempt to reconnect in ${RECONNECT_INTERVAL_MS / 1000} seconds.`);
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      logger.info(HOOK_SERVICE_NAME, "attemptReconnect", "Reconnecting now...");
      this.connect();
    }, RECONNECT_INTERVAL_MS);
  }

  private clearReconnectTimer() {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  disconnect() {
    this.clearReconnectTimer();
    if (this.websocket) {
      logger.info(HOOK_SERVICE_NAME, "disconnect", "Disconnecting from Native Hook.");
      this.websocket.close(1000, "User initiated disconnect");
      this.websocket = null; 
    }
    this.setStatus(HookStatus.DISCONNECTED); // Use enum member
    this.isConnected = false;
  }

  sendMessage(command: string, payload?: any): Promise<HookMessage | null> {
    return new Promise((resolve, reject) => {
      if (!this.websocket || this.websocket.readyState !== WebSocket.OPEN) {
        logger.warn(HOOK_SERVICE_NAME, "sendMessage", "Cannot send message, WebSocket not connected or not open.", { command, currentStatus: this.status });
        return reject(new Error("WebSocket not connected."));
      }
      const messageId = uuidv4();
      const messageToSend: ClientSentMessage = { id: messageId, command, payload }; 
      try {
        this.websocket.send(JSON.stringify(messageToSend));
        logger.debug(HOOK_SERVICE_NAME, "sendMessage", "Sent message to hook:", messageToSend);
        
        const timeoutId = setTimeout(() => {
          if (this.pendingRequests.has(messageId)) {
            logger.warn(HOOK_SERVICE_NAME, "sendMessage", `Request timeout for message ID: ${messageId}`, {command});
            this.pendingRequests.get(messageId)?.reject(new Error(`Request timed out for command: ${command} (ID: ${messageId})`));
            this.pendingRequests.delete(messageId);
            // No longer resolving with null on timeout, reject instead
          }
        }, 10000); // 10 second timeout

        this.pendingRequests.set(messageId, { resolve, reject, timeoutId });

      } catch (error) {
        logger.error(HOOK_SERVICE_NAME, "sendMessage", "Error sending message to hook:", error);
        reject(error);
      }
    });
  }

  getHookStatus(): HookStatus {
    return this.status;
  }

  onStatusChange(callback: (status: HookStatus) => void) {
    this.statusChangeListeners.push(callback);
  }

  onMessage(callback: (message: HookMessage) => void) {
    this.messageListeners.push(callback);
  }
  
  removeStatusListener(callback: (status: HookStatus) => void) {
    this.statusChangeListeners = this.statusChangeListeners.filter(cb => cb !== callback);
  }

  removeMessageListener(callback: (message: HookMessage) => void) {
    this.messageListeners = this.messageListeners.filter(cb => cb !== callback);
  }

  public sendSimulateKeystrokes(text: string, pressEnter: boolean = false): Promise<HookMessage | null> {
    const payload: KeystrokePayload = { command: "simulate_keystrokes", text, pressEnter };
    return this.sendMessage("simulate_keystrokes", payload);
  }

  public sendGetFocusedInputText(): Promise<HookMessage | null> {
    return this.sendMessage("get_focused_input_text");
  }

  public sendShellCommand(command: string): Promise<HookMessage | null> {
    const payload: ShellCommandPayload = { command };
    return this.sendMessage("execute_shell_command", payload);
  }

  public sendMouseMove(x: number, y: number): Promise<HookMessage | null> {
    const payload: MouseMovePayload = { x, y };
    return this.sendMessage("move_mouse", payload);
  }

  public sendMouseClick(x: number, y: number, button: "left" | "right", clickType: "click" | "double_click"): Promise<HookMessage | null> {
    const payload: MouseClickPayload = { x, y, button, click_type: clickType };
    return this.sendMessage("mouse_click", payload);
  }

  public sendStartFSMonitoring(paths: string[], recursive: boolean = true, alias?: string): Promise<HookMessage | null> {
    const payload: StartFSMonitoringPayload = { paths, recursive, alias };
    return this.sendMessage("start_fs_monitoring", payload);
  }

  public sendStopFSMonitoring(paths?: string[]): Promise<HookMessage | null> {
    const payload: StopFSMonitoringPayload = { paths }; // If paths is undefined, it will be sent as such
    return this.sendMessage("stop_fs_monitoring", payload);
  }

  public sendTerminalRunInNewTab(command: string, tabName?: string, activateTerminal?: boolean): Promise<HookMessage | null> {
    const payload: TerminalRunInNewTabPayload = { command, tab_name: tabName, activate_terminal: activateTerminal };
    return this.sendMessage("terminal_run_in_new_tab", payload);
  }

  public sendQuitApplication(payload: QuitApplicationPayload): Promise<HookMessage | null> {
    logger.info(HOOK_SERVICE_NAME, "sendQuitApplication", `Sending quit_application for bundle ID: ${payload.bundle_id}`);
    return this.sendMessage('quit_application', payload);
  }

  public sendGetHookContextHistory(): Promise<HookMessage | null> {
    logger.info(HOOK_SERVICE_NAME, "sendGetHookContextHistory", "Requesting hook context history");
    return this.sendMessage("get_hook_context_history");
  }

  public sendTypeInTargetInput(text: string, targetAppBundleId?: string): Promise<HookMessage | null> {
    const payload: TypeInTargetInputPayload = { 
      command: "type_in_target_input", // Explicitly set command in payload for clarity if hook uses it
      text,
      target_app_bundle_id: targetAppBundleId
    };
    return this.sendMessage("type_in_target_input", payload);
  }

  public sendClickButtonInTarget(buttonIdentifier: string, targetAppBundleId?: string): Promise<HookMessage | null> {
    const payload: ClickButtonInTargetPayload = {
      command: "click_button_in_target",
      button_identifier: buttonIdentifier,
      target_app_bundle_id: targetAppBundleId
    };
    return this.sendMessage("click_button_in_target", payload);
  }

  public getIsConnected(): boolean {
    return this.isConnected;
  }
}

export enum HookStatus { 
  INITIALIZING = 'INITIALIZING', // Add explicit string values for enums if they are also used as strings elsewhere
  DISCONNECTED = 'DISCONNECTED',
  CONNECTING = 'CONNECTING',
  CONNECTED = 'CONNECTED',
  RECONNECTING = 'RECONNECTING',
  ERROR = 'ERROR',
  // CLOSING = 'CLOSING', // Was in types.ts, decide if needed here
}

// Export a singleton instance
export const nativeHookService = new NativeHookService(); 