import React, { useEffect, useRef } from 'react';

const TradeResults = ({ tradeLogs, onClearLogs }) => {
  const logEndRef = useRef(null);

  useEffect(() => {
    if (logEndRef.current) {
      logEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [tradeLogs]);

  return (
    <div style={{ padding: '20px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h2 style={{ margin: 0 }}>Trade Results</h2>
        <button
          onClick={onClearLogs}
          style={{
            backgroundColor: '#f44336',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            padding: '6px 12px',
            cursor: 'pointer',
          }}
        >
          Clear Log
        </button>
      </div>

      <div
        style={{
          border: '1px solid #ccc',
          padding: '15px',
          borderRadius: '5px',
          backgroundColor: '#f9f9f9',
          maxHeight: '400px',
          overflowY: 'auto',
          marginTop: '10px',
          fontFamily: 'monospace',
        }}
      >
        {tradeLogs.length > 0 ? (
          tradeLogs.map((log, index) => {
            const text = typeof log === "string" ? log : JSON.stringify(log);

            // SIGNAL COLOR CODING
            let color = "";
            let fontSize = "14px"; 
            if (text.includes("SIGNAL_BUY")) {color = "#3daf2eff"; fontSize = "50px";}
            else if (text.includes("SIGNAL_SELL")) {color = "#ff0000ff"; fontSize = "50px";}
            else if (text.includes("SIGNAL_NONE")) {color = "#0400ffff"; fontSize = "50px";}

            // DETECT ASCII TABLE (INDICATOR or OPTIONS)
            const isAsciiTable =
              text.includes("INDICATOR:") || text.includes("OPTIONS:");

            if (isAsciiTable) {
              // Extract part after INDICATOR: or OPTIONS:
              let ascii = text.includes("INDICATOR:")
                ? text.split("INDICATOR:")[1].trim()
                : text.split("OPTIONS:")[1].trim();

              // Split into lines
              const lines = ascii.split("\n").map(l => l.trim());

              // Keep only rows that start with "|"
              const rows = lines.filter(l => l.startsWith("|"));

              if (rows.length < 2) {
                return (
                  <div key={index} style={{ color: "blue", whiteSpace: "pre-wrap" }}>
                    {ascii}
                  </div>
                );
              }

              // FAST parsing → only first 2 rows matter
              const header = rows[0]
                .split("|")
                .map(x => x.trim())
                .filter(x => x !== "");

              const values = rows[1]
                .split("|")
                .map(x => x.trim())
                .filter(x => x !== "");

              return (
                <table
                  key={index}
                  style={{
                    width: "100%",
                    borderCollapse: "collapse",
                    margin: "10px 0",
                    color: "blue",
                    fontSize: "14px"
                  }}
                >
                  <thead>
                    <tr>
                      {header.map((h, hi) => (
                        <th
                          key={hi}
                          style={{
                            border: "1px solid #007bff",
                            padding: "4px 6px",
                            background: "#e8f1ff",
                            whiteSpace: "nowrap"
                          }}
                        >
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>

                  <tbody>
                    <tr>
                      {values.map((v, vi) => (
                        <td
                          key={vi}
                          style={{
                            border: "1px solid #007bff",
                            padding: "4px 6px",
                            whiteSpace: "nowrap"
                          }}
                        >
                          {v}
                        </td>
                      ))}
                    </tr>
                  </tbody>
                </table>
              );
            }

            // DEFAULT LOG LINE with SIGNAL color
            return (
              <div key={index} style={{ margin: "3px 0", color }}>
                {text}
              </div>
            );
          })
        ) : (
          <p>No trade results to display yet. Connect a broker and start trading!</p>
        )}

        <div ref={logEndRef} />
      </div>
    </div>
  );
};

export default TradeResults;
