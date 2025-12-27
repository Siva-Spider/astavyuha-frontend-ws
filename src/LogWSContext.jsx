// src/LogWSContext.jsx
import React, { createContext, useContext, useEffect, useRef, useState } from "react";

const LogWSContext = createContext(null);
export const useLogWS = () => useContext(LogWSContext);

// 🔹 Helper: fetch Redis-backed history
async function fetchLogHistory(userId) {
  try {
    const res = await fetch(`/logs/history/${userId}?limit=300`);
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data) ? data : [];
  } catch (err) {
    console.error("❌ Failed to fetch log history", err);
    return [];
  }
}

export const LogWSProvider = ({ children }) => {
  const wsRef = useRef(null);
  const callbacksRef = useRef(new Set());
  const [isConnected, setIsConnected] = useState(false);

  // 🔹 Single source of truth for logs
  const [messages, setMessages] = useState([]);

  // -------------------------------------------------
  // 🔥 LOAD HISTORY ON FIRST MOUNT
  // -------------------------------------------------
  useEffect(() => {
    let alive = true;

    async function loadHistory() {
      const storedUser = JSON.parse(localStorage.getItem("user") || "{}");
      const userId = storedUser?.userId || "guest";

      // 1️⃣ Load Redis history
      const history = await fetchLogHistory(userId);

      if (!alive) return;

      if (history.length > 0) {
        const formatted = history.map(m => {
          const ts = m.ts || "";
          const level = (m.level || "INFO").toUpperCase();
          const text =
            typeof m.message === "string"
              ? m.message
              : JSON.stringify(m.message);

          return `[${ts}] ${level}: ${text}`;
        });

        setMessages(formatted);
        localStorage.setItem("tradeLogs", JSON.stringify(formatted));
      } else {
        // 2️⃣ Fallback to localStorage if Redis empty
        const saved = localStorage.getItem("tradeLogs");
        if (saved) {
          try {
            setMessages(JSON.parse(saved));
          } catch {
            setMessages([]);
          }
        }
      }
    }

    loadHistory();

    return () => {
      alive = false;
    };
  }, []);

  // -------------------------------------------------
  // 🔥 WEBSOCKET MESSAGE HANDLER (DEDUP SAFE)
  // -------------------------------------------------
  const handleMessage = (ev) => {
    let m;
    try {
      m = JSON.parse(ev.data);
    } catch {
      m = ev.data;
    }

    if (!m) return;

    let text = "";
    if (typeof m === "string") text = m;
    else if (m.message) text = m.message;
    else if (m.data) text = m.data;
    else text = JSON.stringify(m);

    const ts = m.ts || new Date().toISOString();
    const level = (m.level || "INFO").toUpperCase();
    const formatted = `[${ts}] ${level}: ${text}`;

    setMessages(prev => {
      // 🚫 Dedup guard (important)
      if (prev.length && prev[prev.length - 1] === formatted) {
        return prev;
      }

      const next = [...prev.slice(-999), formatted];
      localStorage.setItem("tradeLogs", JSON.stringify(next));
      return next;
    });

    // notify subscribers with RAW payload
    callbacksRef.current.forEach(cb => {
      try { cb(m); } catch (e) { console.error("callback error", e); }
    });
  };

  // -------------------------------------------------
  // 🔥 START / STOP WEBSOCKET
  // -------------------------------------------------
  const startLogs = (userId) => {
    if (!userId) {
      console.error("❌ startLogs called WITHOUT userId");
      return;
    }

    if (wsRef.current) return; // already connected

    const url = `wss://api.astavyuha.org/ws/logs?user_id=${userId}`;
    console.log("📡 Connecting WebSocket:", url);

    const ws = new WebSocket(url);
    wsRef.current = ws;

    ws.onopen = () => {
      console.log("📡 LogWS connected");
      setIsConnected(true);
    };

    ws.onmessage = handleMessage;

    ws.onclose = () => {
      console.log("🔻 LogWS closed");
      wsRef.current = null;
      setIsConnected(false);
    };

    ws.onerror = (err) => {
      console.error("❌ LogWS error", err);
    };
  };

  const stopLogs = () => {
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
      setIsConnected(false);
    }
  };

  // -------------------------------------------------
  // 🔥 SUBSCRIPTION API
  // -------------------------------------------------
  const subscribe = (cb) => {
    callbacksRef.current.add(cb);
    return () => callbacksRef.current.delete(cb);
  };

  // Cleanup on provider unmount
  useEffect(() => {
    return () => {
      if (wsRef.current) wsRef.current.close();
    };
  }, []);

  return (
    <LogWSContext.Provider
      value={{ messages, isConnected, startLogs, stopLogs, subscribe }}
    >
      {children}
    </LogWSContext.Provider>
  );
};
