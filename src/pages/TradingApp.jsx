import { useState, useEffect, useRef } from "react";
import ConnectBroker from "../components/ConnectBroker";
import SelectStock from "../components/SelectStock";
import TradeResults from "../components/TradeResults";
import { useLogWS } from "../LogWSContext";
import { API_BASE } from "../api";
import "../TradingApp.css";

function TradingApp({ user, setUser }) {
    // -------------------------------------------------
    // 🔥 Persistent App State
    // -------------------------------------------------
    const [activeTab, setActiveTab] = useState("connect");
    const [brokerCount, setBrokerCount] = useState(() => parseInt(localStorage.getItem("brokerCount")) || 1);
    const { startLogs, stopLogs, subscribe } = useLogWS();

   // Load user from localStorage if React state not yet set
    const storedUser = JSON.parse(localStorage.getItem("user") || "{}");
    const activeUser = user || storedUser;

    // Get userId correctly
    const userId = activeUser?.userId || "guest";

    const loadRecentLogs = async () => {
        try {
            const res = await fetch(`${API_BASE}/logs/${userId}?limit=300`);
            if (!res.ok) return;

            const data = await res.json();
            if (!data.logs) return;

            const recovered = data.logs.map(log => {
                const ts = log.ts || new Date().toISOString();
                const level = (log.level || "INFO").toUpperCase();
                const msg = log.message || JSON.stringify(log);
                return `[${ts}] ${level}: ${msg}`;
            });

            setTradeLogs(prev => {
                const merged = [...prev, ...recovered];
                return merged.slice(-1000);
            });
        } catch (err) {
            console.error("Failed to recover logs", err);
        }
    };

    // -------------------------------------------------
    // 🔥 STEP 5B: Sync backend trade state on reload
    // -------------------------------------------------
    useEffect(() => {
        let alive = true;

        async function syncTradeState() {
            try {
                const res = await fetch(`${API_BASE}/trade/status/${userId}`);
                if (!res.ok) return;

                const data = await res.json();
                if (!alive) return;

                if (data.status === "running") {
                    // ✅ Only resume logs
                    startLogs(userId);
                }

            } catch (err) {
                console.error("❌ Failed to sync trade state", err);
            }
        }

        if (userId && userId !== "guest") {
            syncTradeState();
        }

        return () => {
            alive = false;
        };
    }, [userId]);
    useEffect(() => {
        if (!userId || userId === "guest") return;

        async function loadTradeState() {
            try {
                const res = await fetch(`${API_BASE}/trade-state/${userId}`);
                if (!res.ok) return;

                const data = await res.json();
                if (!data.exists) return;

                const state = data.state;

                /* ---------------------------
                1️⃣ Restore CONNECT BROKER
                ---------------------------- */
                if (Array.isArray(state.selectedBrokers)) {
                    setBrokerCount(state.selectedBrokers.length);
                    setSelectedBrokers(state.selectedBrokers);
                }

                /* ---------------------------
                2️⃣ Restore SELECT STOCK
                ---------------------------- */
                if (Array.isArray(state.tradingParameters)) {
                    setStockCount(state.tradingParameters.length);

                    const params = {};
                    const status = {};

                    state.tradingParameters.forEach((p, index) => {
                        const key = `stock_${index}`;

                        params[key] = {
                            ...p,
                            total_shares:
                                Number(p.lots || 0) * Number(p.lot_size || 0)
                        };

                        // All saved trades are active
                        status[key] = "active";
                    });

                    setTradingParameters(params);
                    setTradingStatus(status);
                }

                /* ---------------------------
                3️⃣ Move to results if trading was running
                ---------------------------- */
                const statusRes = await fetch(
                    `${API_BASE}/trade/status/${userId}`
                );
                const statusJson = await statusRes.json();

                if (statusJson.status === "running") {
                    setActiveTab("results");
                }

            } catch (err) {
                console.error("Failed to load trade state", err);
            }
        }

        loadTradeState();
    }, [userId]);


    const [selectedBrokers, setSelectedBrokers] = useState([
        { name: "u", credentials: {}, profileData: null }
    ]);

    const [stockCount, setStockCount] = useState(1);

    const [tradingParameters, setTradingParameters] = useState({});

    const [tradingStatus, setTradingStatus] = useState({});

    // -------------------------------------------------
    // 🔥 FIXED: Restore logs directly inside useState (no wiping)
    // -------------------------------------------------
    const [tradeLogs, setTradeLogs] = useState(() => {
        const saved = localStorage.getItem("tradeLogs");
        return saved ? JSON.parse(saved) : [];
    });
    // SAFETY FIX: Convert any old object logs in localStorage into strings
    useEffect(() => {
        setTradeLogs(prev =>
            prev.map(log =>
                typeof log === "string" ? log : JSON.stringify(log)
            )
        );
    }, []);

    const [payloads, setPayloads] = useState([]);
    const [isTradingActive, setIsTradingActive] = useState(false);
    const wsRef = useRef(null);

    // -------------------------------------------------
    // 🔥 Persist everything except WebSocket
    // -------------------------------------------------
    useEffect(() => localStorage.setItem(`${userId}_activeTab`, activeTab), [activeTab]);
    useEffect(() => localStorage.setItem(`${userId}_tradeLogs`, JSON.stringify(tradeLogs)), [tradeLogs]);

    const [selectionType, setSelectionType] = useState(() => localStorage.getItem(`${userId}_selectionType`) || "EQUITY");
    useEffect(() => localStorage.setItem(`${userId}_selectionType`, selectionType), [selectionType]);

    useEffect(() => {
        const active = Object.values(tradingStatus).includes("active");
        setIsTradingActive(active);
    }, [tradingStatus]);


    // -------------------------------------------------
    // 🔥 Log Handler (Keep last 1000)
    // -------------------------------------------------
    const handleNewLog = (msg) => {
    if (!msg) return;

    let text = "";

    if (typeof msg === "string") {
        text = msg;
    } else if (msg.message) {
        text = msg.message;
    } else if (msg.data) {
        text = msg.data;
    } else {
        text = JSON.stringify(msg.message);
    }

    const ts = msg.ts || new Date().toISOString();
    const level = (msg.level || "INFO").toUpperCase();

    const formatted = `[${ts}] ${level}: ${text}`;

    setTradeLogs(prev => [...prev.slice(-999), formatted]);
};

    // -------------------------------------------------
    // 🔥 Subscribe to raw WebSocket messages
    // -------------------------------------------------
    useEffect(() => {
        loadRecentLogs();      // 🔥 RECOVER MISSED INTERVALS

        const unsubscribe = subscribe((msg) => {
            handleNewLog(msg);
        });

        return () => unsubscribe();
    }, []);



    // -------------------------------------------------
    // 🔥 Logout
    // -------------------------------------------------
    const handleLogout = () => {
        localStorage.clear();
        setUser(null);
        setActiveTab("connect");
        setBrokerCount(1);
        setSelectedBrokers([{ name: "u", credentials: {}, profileData: null }]);
        setTradingParameters({});
        setTradingStatus({});
        setTradeLogs([]);
        setSelectionType("EQUITY");
    };

    const handleStopAllTrades = async () => {
    try {
        const res = await fetch(`${API_BASE}/stop-all-trading`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ userId })
        });

        const data = await res.json();

        if (data.success) {
            setTradeLogs(prev => [...prev, "🛑 STOP signal sent. Trading will stop shortly."]);
        } else {
            setTradeLogs(prev => [...prev, "❌ Failed to send stop signal"]);
        }
    } catch (err) {
        console.error(err);
        setTradeLogs(prev => [...prev, "❌ Error sending STOP request"]);
    }
};

    // -------------------------------------------------
    // 🔥 API FUNCTIONS
    // -------------------------------------------------
    const handleConnectBroker = async (e) => {
        e.preventDefault();
        try {
            const res = await fetch(`${API_BASE}/connect-broker`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ userId, brokers: selectedBrokers }),
            });

            const data = await res.json();

            setSelectedBrokers((prev) =>
                prev.map((broker) => {
                    const fetched = data.find((b) => b.broker_key === broker.name);
                    if (fetched?.status === "success")
                        return { ...broker, profileData: fetched.profileData };
                    return { ...broker, profileData: { status: "failed", message: fetched?.message || "Connection failed." } };
                })
            );
        } catch (err) {
            console.error(err);
            setTradeLogs((prev) => [...prev, "❌ Error connecting broker"]);
        }
    };

    const fetchLotSize = async (index, symbol_key, symbol_value, type) => {
        try {
            const response = await fetch(`${API_BASE}/get-lot-size`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({  userId, symbol_key, symbol_value, type }),
            });
            const data = await response.json();

            if (data.lot_size) {
                const key = `stock_${index}`;
                const lotSize = data.lot_size;
                const tickSize = data.tick_size || 0;
                const lots = tradingParameters[key]?.lots || 0;

                setTradingParameters((prev) => ({
                    ...prev,
                    [key]: {
                        ...prev[key],
                        lot_size: lotSize,
                        tick_size: tickSize,
                        total_shares: lots * lotSize,
                    },
                }));
            }
        } catch (err) {
            console.error("Error fetching lot size:", err);
        }
    };

    const handleTradeToggle = async (index) => {
        const key = `stock_${index}`;
        const status = tradingStatus[key];
        const symbol = tradingParameters[key]?.symbol_value;
        const broker = tradingParameters[key]?.broker;

        if (status === "active") {
            try {
                const res = await fetch(`${API_BASE}/disconnect-stock`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ userId, symbol_value: symbol, broker }),
                });

                const text = await res.text(); // 🔥 read raw response

                if (!res.ok) {
                    throw new Error(`HTTP ${res.status}: ${text}`);
                }

                const data = JSON.parse(text);

                setTradingStatus((prev) => ({ ...prev, [key]: "inactive" }));
                setTradeLogs((prev) => [...prev, data.message]);

            } catch (err) {
                console.error("Disconnect failed:", err);
                setTradeLogs((prev) => [
                    ...prev,
                    `❌ Error disconnecting ${symbol}: ${err.message}`
                ]);
            }
            return;
        }


        setTradingStatus((prev) => ({ ...prev, [key]: "active" }));
        setTradeLogs((prev) => [...prev, `🟢 Initiating trade for ${symbol}`]);
        setActiveTab("results");
    };

    const handleStartAllTrades = async () => {
        console.log("🔥 handleStartAllTrades triggered");
        setActiveTab("results");

        const params = [];
        for (let i = 0; i < stockCount; i++) {
            const key = `stock_${i}`;
            const p = tradingParameters[key];
            if (p?.broker) params.push(p);
            else setTradeLogs((prev) => [...prev, `❌ Select a broker for stock ${i + 1}`]);
        }
        if (params.length === 0) return;

        try {
            setTradeLogs((prev) => [...prev, "🟢 Starting all trades..."]);
            console.log("🔥🔥 TEST A: EXECUTION REACHED HERE — BEFORE FETCH");
            const res = await fetch(`${API_BASE}/start-all-trading`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({  userId, tradingParameters: params, selectedBrokers }),
            });
            console.log("🔥 Collected params =", params);
            const data = await res.json();
            console.log("🔥 Backend response:", data);

            // ❗ Validate backend response
            if (!res.ok || data.success !== true) {
                setTradeLogs(prev => [...prev, `❌ Failed to start trades: ${data.message || "Unknown error"}`]);
                return;
            }

            // Start logs only if success is true
            setTradeLogs(prev => [...prev, `✅ ${data.message}`]);

            let newStatus = {};
            params.forEach((_, i) => (newStatus[`stock_${i}`] = "active"));
            setTradingStatus((prev) => ({ ...prev, ...newStatus }));
            
            console.log("🔥🔥 TEST B: ABOUT TO CALL startLogs()");

            setIsTradingActive(true);
            startLogs(userId);
            console.log("🔥🔥 TEST C: startLogs() FINISHED SUCCESSFULLY");

        } catch (err) {
            setTradeLogs((prev) => [...prev, "❌ Error starting trades"]);
        }
    };

    const handleClosePosition = async (index) => {
        const key = `stock_${index}`;
        const symbol = tradingParameters[key]?.symbol_value;
        try {
            const res = await fetch(`${API_BASE}/close-position`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({  userId, symbol_value: symbol }),
            });
            const data = await res.json();
            setTradeLogs((prev) => [...prev, data.message]);
        } catch (err) {
            setTradeLogs((prev) => [...prev, `❌ Error closing ${symbol}`]);
        }
    };

    const handleCloseAll = async () => {
        stopLogs();
        setIsTradingActive(false);
        try {
            const res = await fetch(`${API_BASE}/close-all-positions`, {  method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ userId }) });
            const data = await res.json();
            setTradeLogs((prev) => [...prev, data.message]);
        } catch (err) {
            setTradeLogs((prev) => [...prev, "❌ Error closing all positions"]);
        }
    };

    const handleClearLogs = () => setTradeLogs([]);

    // -------------------------------------------------
    // 🔥 PAGE RENDERING
    // -------------------------------------------------
    const renderContent = () => {
        switch (activeTab) {
            case "connect":
                return (
                    <ConnectBroker
                        brokerCount={brokerCount}
                        selectedBrokers={selectedBrokers}
                        onBrokerCountChange={(e) => {
                            const count = parseInt(e.target.value);
                            setBrokerCount(count);
                            const updated = [...selectedBrokers].slice(0, count);
                            while (updated.length < count) updated.push({ name: "u", credentials: {}, profileData: null });
                            setSelectedBrokers(updated);
                        }}
                        onBrokerChange={(e, index) => {
                            const updated = [...selectedBrokers];
                            updated[index].name = e.target.value;
                            updated[index].profileData = null;
                            setSelectedBrokers(updated);
                        }}
                        onCredentialChange={(e, index, cred) => {
                            const updated = [...selectedBrokers];
                            updated[index].credentials[cred] = e.target.value;
                            setSelectedBrokers(updated);
                        }}
                        onConnect={handleConnectBroker}
                    />
                );

            case "select":
                return (
                    <SelectStock
                        stockCount={stockCount}
                        tradingParameters={tradingParameters}
                        selectedBrokers={selectedBrokers}
                        tradingStatus={tradingStatus}
                        selectionType={selectionType}
                        setSelectionType={setSelectionType}
                        onStockCountChange={(e) => {
                            const count = parseInt(e.target.value);
                            setStockCount(count);

                            let params = {};
                            let status = {};
                            for (let i = 0; i < count; i++) {
                                const k = `stock_${i}`;
                                params[k] =
                                    tradingParameters[k] ||
                                    {
                                        symbol_value: "RELIANCE",
                                        symbol_key: "",
                                        broker: "",
                                        strategy: "ADX_MACD_WillR_Supertrend",
                                        interval: 0,
                                        lots: 0,
                                        lot_size: 0,
                                        total_shares: 0,
                                        target_percentage: 0,
                                        type: "EQUITY",
                                    };
                                status[k] = tradingStatus[k] || "inactive";
                            }

                            setTradingParameters(params);
                            setTradingStatus(status);
                        }}
                        onStockSelection={(i, key, val, type) => {
                            const stockKey = `stock_${i}`;
                            setTradingParameters(prev => ({
                                ...prev,
                                [stockKey]: {
                                    type,
                                    symbol_key: key,
                                    symbol_value: val,
                                    broker: prev[stockKey]?.broker || "",
                                    strategy: prev[stockKey]?.strategy || "ADX_MACD_WillR_Supertrend",
                                    interval: prev[stockKey]?.interval || "1",
                                    lots: prev[stockKey]?.lots || 0,
                                    lot_size: prev[stockKey]?.lot_size || 0,
                                    tick_size: prev[stockKey]?.tick_size || 0,
                                    total_shares: prev[stockKey]?.lots * prev[stockKey]?.lot_size || 0,
                                }
                            }));
                            fetchLotSize(i, key, val, type);
                        }}
                        onParameterChange={(e, i, field) => {
                            const stockKey = `stock_${i}`;
                            const val = e.target.value;

                            setTradingParameters((prev) => {
                                const updated = { 
                                    ...prev, 
                                    [stockKey]: {
                                        type: prev[stockKey]?.type || "EQUITY",
                                        symbol_key: prev[stockKey]?.symbol_key || "",
                                        symbol_value: prev[stockKey]?.symbol_value || "",
                                        broker: prev[stockKey]?.broker || "",
                                        strategy: prev[stockKey]?.strategy || "ADX_MACD_WillR_Supertrend",
                                        interval: prev[stockKey]?.interval || "1",
                                        lots: prev[stockKey]?.lots || 0,
                                        lot_size: prev[stockKey]?.lot_size || 0,
                                        total_shares: prev[stockKey]?.total_shares || 0,
                                        target_percentage: prev[stockKey]?.target_percentage || 0,
                                        ...prev[stockKey],
                                        [field]: val
                                    }
                                };
                                
                                const lots = parseInt(updated[stockKey].lots || 0);
                                const size = parseInt(updated[stockKey].lot_size || 0);
                                updated[stockKey].total_shares = lots * size;

                                return updated;
                            });
                        }}
                        onTradeToggle={handleTradeToggle}
                        onStartAllTrades={handleStartAllTrades}
                        onClosePosition={handleClosePosition}
                        onCloseAllPositions={handleCloseAll}
                        onStopAllTrades={handleStopAllTrades}
                    />
                );

            case "results":
                return (
                    <TradeResults
                        tradeLogs={tradeLogs}
                        onClearLogs={handleClearLogs}
                        onLog={handleNewLog}
                        isTradingActive={isTradingActive}
                    />
                );

            default:
                return <div>Invalid tab</div>;
        }
    };

    return (
        <div className="trading-app-container">
            <header className="trading-header">
                {user && <button className="logout-btn" onClick={handleLogout}>Logout</button>}
            </header>

            <div className="trading-main">
                <div className="tab-buttons">
                    <button onClick={() => setActiveTab("connect")} className={activeTab === "connect" ? "active" : ""}>Connect Broker</button>
                    <button onClick={() => setActiveTab("select")} className={activeTab === "select" ? "active" : ""}>Select Stock</button>
                    <button onClick={() => setActiveTab("results")} className={activeTab === "results" ? "active" : ""}>Trade Results</button>
                </div>

                <div className="trading-content">{renderContent()}</div>
            </div>
        </div>
    );
}

export default TradingApp;
