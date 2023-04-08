import { Accessor, Setter, createSignal } from "solid-js";

import EventEmitter from "eventemitter3";
import WebSocket from "isomorphic-ws";

import type { AvailableProtocols, EventProtocol } from ".";

/**
 * All possible event client states.
 */
export enum ConnectionState {
  Idle,
  Connecting,
  Connected,
  Disconnected,
}

/**
 * Events provided by the client.
 */
type Events<T extends AvailableProtocols, P extends EventProtocol<T>> = {
  error: (error: Error) => void;
  event: (event: P["server"]) => void;
  state: (state: ConnectionState) => void;
};

/**
 * Simple wrapper around the Revolt websocket service.
 */
export class EventClient<T extends AvailableProtocols> extends EventEmitter<
  Events<T, EventProtocol<T>>
> {
  #protocolVersion: T;
  #transportFormat: "json" | "msgpack";
  #heartbeatInterval: number;
  #pongTimeout: number;

  readonly state: Accessor<ConnectionState>;
  #setStateSetter: Setter<ConnectionState>;

  #socket: WebSocket | undefined;
  #heartbeatIntervalReference: number | undefined;
  #pongTimeoutReference: number | undefined;

  /**
   * Create a new event client.
   * @param protocolVersion Target protocol version
   * @param transportFormat Communication format
   * @param heartbeatInterval Interval in seconds to send ping
   * @param pongTimeout Time in seconds until heartbeat times out
   */
  constructor(
    protocolVersion: T,
    transportFormat: "json" = "json",
    heartbeatInterval = 30,
    pongTimeout = 10
  ) {
    super();

    this.#protocolVersion = protocolVersion;
    this.#transportFormat = transportFormat;
    this.#heartbeatInterval = heartbeatInterval;
    this.#pongTimeout = pongTimeout;

    const [state, setState] = createSignal(ConnectionState.Idle);
    this.state = state;
    this.#setStateSetter = setState;

    this.disconnect = this.disconnect.bind(this);
  }

  /**
   * Set the current state
   * @param state state
   */
  private setState(state: ConnectionState) {
    this.#setStateSetter(state);
    this.emit("state", state);
  }

  /**
   * Connect to the websocket service.
   * @param uri WebSocket URI
   * @param token Authentication token
   */
  connect(uri: string, token: string) {
    this.disconnect();
    this.setState(ConnectionState.Connecting);

    this.#socket = new WebSocket(
      `${uri}?version=${this.#protocolVersion}&format=${
        this.#transportFormat
      }&token=${token}`
    );

    this.#socket.onopen = () => {
      this.#heartbeatIntervalReference = setInterval(
        () =>
          (this.#pongTimeoutReference = setTimeout(
            this.disconnect,
            this.#pongTimeout * 1e3
          ) as never),
        this.#heartbeatInterval & 1e3
      ) as never;
    };

    this.#socket.onerror = (error) => {
      this.emit("error", error as never);
    };

    this.#socket.onmessage = (event) => {
      if (this.#transportFormat === "json") {
        if (typeof event.data === "string") {
          this.handle(JSON.parse(event.data));
        }
      }
    };

    let closed = false;
    this.#socket.onclose = () => {
      if (closed) return;
      closed = true;

      clearInterval(this.#heartbeatIntervalReference);
      this.disconnect();
    };
  }

  /**
   * Disconnect the websocket client.
   */
  disconnect() {
    if (!this.#socket) return;
    let socket = this.#socket;
    this.#socket = undefined;
    socket.close();
    this.setState(ConnectionState.Disconnected);
  }

  /**
   * Send an event to the server.
   * @param event Event
   */
  send(event: EventProtocol<T>["client"]) {
    console.info(event);
  }

  /**
   * Handle events intended for client before passing them along.
   * @param event Event
   */
  handle(event: EventProtocol<T>["server"]) {
    switch (event.type) {
      case "Ping":
        this.send({
          type: "Pong",
          data: event.data,
        });
        return;
      case "Pong":
        clearTimeout(this.#pongTimeoutReference);
        return;
      case "Error":
        this.emit("error", event as never);
        this.disconnect();
        return;
    }

    switch (this.state()) {
      case ConnectionState.Connecting:
        if (event.type === "Authenticated") {
          // no-op
        } else if (event.type === "Ready") {
          this.emit("event", event);
          this.setState(ConnectionState.Connected);
        } else {
          console.error("WE ARE IN WRONG STATE");
        }
        break;
      case ConnectionState.Connected:
        if (event.type === "Authenticated" || event.type === "Ready") {
          throw `Unreachable code. Received ${event.type} in Connected state.`;
        } else {
          this.emit("event", event);
        }
        break;
      default:
        throw `Unreachable code. Received ${
          event.type
        } in state ${this.state()}.`;
    }
  }
}
