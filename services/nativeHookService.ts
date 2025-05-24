import { v4 as uuidv4 } from 'uuid';
import { logger } from './logger';

const HOOK_SERVICE_NAME = "NativeHookService";
const HOOK_WEBSOCKET_URL = "ws://localhost:8765";
const RECONNECT_INTERVAL_MS = 5000;

export type HookStatus = "disconnected" | "connecting" | "connected" | "error";

export interface HookMessage {
  id: string;
  command?: string; // Used for client-to-server messages
  type?: string;    // Used for server-to-client messages
  payload?: any;
  status?: "success" | "error" | "received"; // For server responses
  original_command?: string; // For server acks/responses
  error_message?: string; // For server errors
  received_payload?: any; // For server acks
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
}

class NativeHookService implements NativeHookServiceInterface {
  private websocket: WebSocket | null = null;
  private status: HookStatus = "disconnected";
  private statusChangeListeners: Array<(status: HookStatus) => void> = [];
  private messageListeners: Array<(message: HookMessage) => void> = [];
  private reconnectTimer: NodeJS.Timeout | null = null;
  private pendingRequests: Map<string, (response: HookMessage | null) => void> = new Map();

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
    this.setStatus("connecting");
    logger.info(HOOK_SERVICE_NAME, "connect", `Attempting to connect to Native Hook at ${HOOK_WEBSOCKET_URL}...`);

    try {
      this.websocket = new WebSocket(HOOK_WEBSOCKET_URL);

      this.websocket.onopen = () => {
        this.setStatus("connected");
        this.clearReconnectTimer();
        logger.info(HOOK_SERVICE_NAME, "onopen", "Successfully connected to Native Hook.");
        // Optionally send a ping or initial handshake message here
      };

      this.websocket.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data as string) as HookMessage;
          logger.debug(HOOK_SERVICE_NAME, "onmessage", "Received message from hook:", message);
          this.messageListeners.forEach(cb => cb(message));

          // Handle responses to specific requests
          if (message.id && this.pendingRequests.has(message.id)) {
            const resolve = this.pendingRequests.get(message.id);
            resolve?.(message);
            this.pendingRequests.delete(message.id);
          }

        } catch (error) {
          logger.error(HOOK_SERVICE_NAME, "onmessage", "Error parsing message from hook:", error, event.data);
        }
      };

      this.websocket.onclose = (event) => {
        logger.warn(HOOK_SERVICE_NAME, "onclose", `Disconnected from Native Hook. Code: ${event.code}, Reason: ${event.reason || 'N/A'}. Clean close: ${event.wasClean}`);
        this.setStatus(this.status === "connecting" ? "error" : "disconnected"); 
        this.websocket = null;
        this.attemptReconnect();
      };

      this.websocket.onerror = (error) => {
        logger.error(HOOK_SERVICE_NAME, "onerror", "Native Hook WebSocket error:", error);
        // onclose will be called subsequently, which handles reconnect logic
        // If onclose isn't called, we might need to force a reconnect attempt here too
        if (this.status !== "disconnected") { // If it wasn't a clean disconnect initiated by us
            this.setStatus("error");
        }
      };
    } catch (error) {
        logger.error(HOOK_SERVICE_NAME, "connect", "Error initiating WebSocket connection:", error);
        this.setStatus("error");
        this.attemptReconnect();
    }
  }

  private attemptReconnect() {
    if (this.reconnectTimer) return; // Already trying to reconnect
    if (this.status === "connecting") return; // Don't stack reconnect attempts if one is ongoing
    
    this.setStatus("connecting"); // Indicate we are trying
    logger.info(HOOK_SERVICE_NAME, "attemptReconnect", `Will attempt to reconnect in ${RECONNECT_INTERVAL_MS / 1000} seconds.`);
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null; // Clear the timer reference before attempting
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
      this.websocket.close(1000, "User initiated disconnect"); // 1000 is normal closure
      this.websocket = null; 
    }
    this.setStatus("disconnected");
  }

  sendMessage(command: string, payload?: any): Promise<HookMessage | null> {
    return new Promise((resolve, reject) => {
      if (!this.websocket || this.websocket.readyState !== WebSocket.OPEN) {
        logger.warn(HOOK_SERVICE_NAME, "sendMessage", "Cannot send message, WebSocket not connected or not open.", { command, currentStatus: this.status });
        return reject(new Error("WebSocket not connected."));
      }
      const messageId = uuidv4();
      const message: HookMessage = { id: messageId, command, payload };
      try {
        this.websocket.send(JSON.stringify(message));
        logger.debug(HOOK_SERVICE_NAME, "sendMessage", "Sent message to hook:", message);
        
        // Store the resolve function to be called when a response with this ID arrives
        this.pendingRequests.set(messageId, resolve);

        // Timeout for the request
        setTimeout(() => {
          if (this.pendingRequests.has(messageId)) {
            logger.warn(HOOK_SERVICE_NAME, "sendMessage", `Request timeout for message ID: ${messageId}`, {command});
            this.pendingRequests.delete(messageId);
            resolve(null); // Resolve with null on timeout, or reject(new Error('Request timed out'))
          }
        }, 10000); // 10 second timeout

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
}

// Export a singleton instance
export const nativeHookService = new NativeHookService(); 