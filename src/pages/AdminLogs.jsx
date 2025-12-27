import React, { useState, useEffect } from "react";
import { API_BASE } from "../api";
import { jsPDF } from "jspdf"; // <- make sure you installed: npm install jspdf

/* --------------------------------------------------
   🌙 Modern Dark Mode Toggle Switch Component
-------------------------------------------------- */
function DarkModeSwitch({ darkMode, setDarkMode }) {
  return (
    <div
      onClick={() => setDarkMode(!darkMode)}
      style={{
        display: "flex",
        alignItems: "center",
        gap: "8px",
        cursor: "pointer",
        padding: "6px 10px",
        background: darkMode ? "#374151" : "#E5E7EB",
        color: darkMode ? "white" : "#111",
        borderRadius: "20px",
        transition: "0.3s",
        userSelect: "none",
      }}
    >
      <span style={{ fontSize: "18px" }}>{darkMode ? "🌙" : "🌞"}</span>

      {/* Switch Body */}
      <div
        style={{
          width: "40px",
          height: "20px",
          background: darkMode ? "#4B5563" : "#CBD5E1",
          borderRadius: "20px",
          position: "relative",
          transition: "0.3s",
        }}
      >
        {/* Switch Knob */}
        <div
          style={{
            width: "18px",
            height: "18px",
            background: "white",
            borderRadius: "50%",
            position: "absolute",
            top: "1px",
            left: darkMode ? "20px" : "2px",
            transition: "0.3s",
            boxShadow: "0 2px 4px rgba(0,0,0,0.3)",
          }}
        ></div>
      </div>
    </div>
  );
}

function renderLogLine(line, darkMode) {
  let log;
  try {
    log = JSON.parse(line);
  } catch {
    return <div style={{ marginBottom: "10px" }}>{line}</div>;
  }

  const levelColor = {
    error: "#DC2626",
    warning: "#F59E0B",
    info: "#10B981",
  };

  return (
    <div
      style={{
        padding: "10px",
        marginBottom: "12px",
        borderRadius: "6px",
        background: darkMode ? "#1F2937" : "#ffffff",
        border: "1px solid #ddd",
      }}
    >
      <div style={{ fontWeight: "bold", marginBottom: "5px" }}>
        <span style={{ color: levelColor[log.level] || "#4B5563" }}>
          [{log.ts}] {log.level.toUpperCase()}
        </span>
      </div>

      <div style={{ marginBottom: "5px" }}>
        <strong>Message:</strong>
        <pre
          style={{
            whiteSpace: "pre-wrap",
            margin: 0,
            color: darkMode ? "#E5E7EB" : "#333",
          }}
        >
          {log.message}
        </pre>
      </div>

      {log.user_id && <div><strong>User:</strong> {log.user_id}</div>}
      {log.type && <div><strong>Type:</strong> {log.type}</div>}
    </div>
  );
}

function formatLogForExport(line) {
  let log;
  try {
    log = JSON.parse(line);
  } catch {
    return line; // fallback if not JSON
  }

  let txt = `[${log.ts}] ${log.level.toUpperCase()}\n`;
  txt += `Message: ${log.message}\n`;

  if (log.user_id) txt += `User: ${log.user_id}\n`;
  if (log.type) txt += `Type: ${log.type}\n`;

  return txt + "\n";
}

/* --------------------------------------------------
   ⭐ MAIN ADMIN LOG VIEWER PAGE
-------------------------------------------------- */
export default function AdminLogs() {
  const [users, setUsers] = useState([]);
  const [selectedUser, setSelectedUser] = useState("");
  const [type, setType] = useState("fastapi");

  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");

  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(false);

  const [darkMode, setDarkMode] = useState(false);

  // 🔹 Fetch user list for dropdown
  useEffect(() => {
    fetch(`${API_BASE}/users`)
      .then((res) => res.json())
      .then((data) => setUsers(data.users || []))
      .catch(() => setUsers([]));
  }, []);

  const fetchLogs = async () => {
    if (!selectedUser) return alert("Please select a user");
    if (!fromDate || !toDate) return alert("Select BOTH FROM and TO dates");

    setLoading(true);
    setLogs([]);

    try {
      const res = await fetch(
        `${API_BASE}/admin/get-user-logs?userId=${selectedUser}&type=${type}&from=${fromDate}&to=${toDate}`
      );
      const data = await res.json();

      if (data.success) setLogs(data.logs || []);
      else alert(data.message || "Unable to fetch logs");
    } catch (err) {
      console.error(err);
      alert("Error fetching logs");
    }

    setLoading(false);
  };

  /* --------------------------------------------------
     💾 DOWNLOAD HELPERS
  -------------------------------------------------- */

  const downloadFile = (blob, filename) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  const handleDownload = (format) => {
    if (!logs || logs.length === 0) {
      alert("No logs to download");
      return;
    }

    const baseName = `${selectedUser || "logs"}_${type}_${fromDate}_to_${toDate}`;

    if (format === "text") {
      const content = logs.map(line => formatLogForExport(line)).join("\n");
      const blob = new Blob([content], {
        type: "text/plain;charset=utf-8",
      });
      downloadFile(blob, `${baseName}.txt`);
    }

    if (format === "json") {
      // Try to parse each log line as JSON, if possible
      let parsed = [];
      let anyParsed = false;

      logs.forEach((line) => {
        try {
          const obj = JSON.parse(line);
          parsed.push(obj);
          anyParsed = true;
        } catch {
          parsed.push(line);
        }
      });

      const content = JSON.stringify(
        logs.map(line => formatLogForExport(line)),
        null,
        2
      );

      const blob = new Blob([content], {
        type: "application/json;charset=utf-8",
      });
      downloadFile(blob, `${baseName}.json`);
    }

    if (format === "pdf") {
      const doc = new jsPDF({
        orientation: "p",
        unit: "pt",
        format: "a4",
      });

      const content = logs.map(line => formatLogForExport(line)).join("\n");

      doc.setFont("courier", "normal");
      doc.setFontSize(9);
      doc.setLineHeightFactor(1.1);

      const marginLeft = 40;
      const marginTop = 40;
      const maxWidth = 515;
      const lineHeight = 12;            // height of each printed line
      const pageHeight = doc.internal.pageSize.getHeight();

      const wrapped = doc.splitTextToSize(content, maxWidth);

      let y = marginTop;

      wrapped.forEach((line) => {
        // Add new page if printing past bottom margin
        if (y + lineHeight > pageHeight - marginTop) {
          doc.addPage();
          y = marginTop;
        }

        doc.text(line, marginLeft, y);
        y += lineHeight;
      });

      doc.save(`${baseName}.pdf`);
    }

  };

  return (
    <div
      style={{
        padding: 20,
        background: darkMode ? "#1F2937" : "#FFFFFF",
        minHeight: "100vh",
        color: darkMode ? "white" : "#111",
        transition: "0.3s",
      }}
    >
      {/* HEADER */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: "1.5rem",
        }}
      >
        <h2 style={{ margin: 0 }}>🔍 Admin Log Viewer</h2>

        <DarkModeSwitch darkMode={darkMode} setDarkMode={setDarkMode} />
      </div>

      {/* FILTER BAR */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "1rem",
          padding: "1rem",
          background: darkMode ? "#374151" : "#f0f4ff",
          borderRadius: "8px",
          marginBottom: "1rem",
          flexWrap: "wrap",
          transition: "0.3s",
        }}
      >
        {/* User Select */}
        <div>
          <label style={{ fontWeight: "bold" }}>User:</label>
          <select
            value={selectedUser}
            onChange={(e) => setSelectedUser(e.target.value)}
            style={inputStyle}
          >
            <option value="">-- Select User --</option>
            {users.map((u) => (
              <option key={u.userId} value={u.userId}>
                {u.userId} — {u.username}
              </option>
            ))}
          </select>
        </div>

        {/* Log Type */}
        <div>
          <label style={{ fontWeight: "bold" }}>Log Type:</label>
          <select
            value={type}
            onChange={(e) => setType(e.target.value)}
            style={inputStyle}
          >
            <option value="fastapi">FastAPI Logs</option>
            <option value="trading">Trading Logs</option>
          </select>
        </div>

        {/* From Date */}
        <div>
          <label style={{ fontWeight: "bold" }}>From:</label>
          <input
            type="date"
            value={fromDate}
            onChange={(e) => setFromDate(e.target.value)}
            style={inputStyle}
          />
        </div>

        {/* To Date */}
        <div>
          <label style={{ fontWeight: "bold" }}>To:</label>
          <input
            type="date"
            value={toDate}
            onChange={(e) => setToDate(e.target.value)}
            style={inputStyle}
          />
        </div>

        {/* Fetch Button */}
        <button style={buttonStyle} onClick={fetchLogs}>
          {loading ? "Loading..." : "Fetch Logs"}
        </button>
      </div>

      {/* DOWNLOAD BAR */}
      <div
        style={{
          display: "flex",
          justifyContent: "flex-end",
          gap: "0.5rem",
          marginBottom: "0.8rem",
          flexWrap: "wrap",
        }}
      >
        <span style={{ alignSelf: "center", fontSize: "0.9rem" }}>
          Download as:
        </span>
        <button
          style={{ ...downloadButtonStyle, backgroundColor: "#2563EB" }}
          onClick={() => handleDownload("text")}
        >
          .txt
        </button>
        <button
          style={{ ...downloadButtonStyle, backgroundColor: "#059669" }}
          onClick={() => handleDownload("json")}
        >
          .json
        </button>
        <button
          style={{ ...downloadButtonStyle, backgroundColor: "#DC2626" }}
          onClick={() => handleDownload("pdf")}
        >
          .pdf
        </button>
      </div>

      {/* LOG DISPLAY */}
      <div
        style={{
          whiteSpace: "pre-wrap",
          background: darkMode ? "#2D3748" : "#FFF9E6",
          padding: "1rem",
          borderRadius: "8px",
          border: "1px solid #ddd",
          minHeight: "400px",
          maxHeight: "600px",
          overflowY: "auto",
          fontFamily: "monospace",
          fontSize: "14px",
          color: darkMode ? "#E5E7EB" : "#333",
          transition: "0.3s",
        }}
      >
        {logs.length === 0 ? (
          loading ? "Fetching logs..." : "No logs found."
        ) : (
          logs.map((line, idx) => (
            <div key={idx}>
              {renderLogLine(line, darkMode)}
            </div>
          ))
        )}

      </div>
    </div>
  );
}

/* --------------------------------------------------
   🎨 Reusable Styles
-------------------------------------------------- */
const inputStyle = {
  marginLeft: "0.5rem",
  padding: "0.4rem",
  borderRadius: "6px",
  border: "1px solid #ccc",
};

const buttonStyle = {
  padding: "0.6rem 1.2rem",
  backgroundColor: "#007bff",
  color: "white",
  border: "none",
  borderRadius: "6px",
  cursor: "pointer",
  fontWeight: "bold",
  transition: "0.2s",
};

const downloadButtonStyle = {
  padding: "0.3rem 0.6rem",
  color: "white",
  border: "none",
  borderRadius: "6px",
  cursor: "pointer",
  fontSize: "0.8rem",
  fontWeight: "600",
  transition: "0.2s",
};
