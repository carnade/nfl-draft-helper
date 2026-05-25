import React, { useState, useEffect, useRef, useContext } from "react";
import HCaptcha from "@hcaptcha/react-hcaptcha";
import { ThemeContext } from "./ThemeContext";
import "./Settings.css";

const HCAPTCHA_SITE_KEY = "3bb6d565-5eb0-425f-acf8-64374f8bbc7b";
const SLEEPER_GRAPHQL = "https://api.sleeper.app/graphql";

function sleeperPost(body) {
  return fetch(SLEEPER_GRAPHQL, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-platform": "web" },
    body: JSON.stringify(body),
  }).then(r => r.json());
}

function decodeToken(token) {
  try {
    return JSON.parse(atob(token.split(".")[1]));
  } catch {
    return null;
  }
}

function loadSleeperAuth() {
  try {
    return JSON.parse(localStorage.getItem("sleeper_auth") || "null");
  } catch {
    return null;
  }
}

function Settings() {
  // New state for standard username
  const [username, setUsername] = useState("");

  // Existing states
  const [defaultRankings, setDefaultRankings] = useState({
    dynasty_sf: { name: "default", data: "" },
    dynasty_ppr: { name: "default", data: "" },
    dynasty_half_ppr: { name: "default", data: "" },
    redraft_sf: { name: "default", data: "" },
    redraft_ppr: { name: "default", data: "" },
    redraft_half_ppr: { name: "default", data: "" },
  });

  const { theme, setTheme } = useContext(ThemeContext);

  // Sleeper auth state
  const [sleeperAuth, setSleeperAuth] = useState(() => loadSleeperAuth());
  const [loginStep, setLoginStep] = useState("idle"); // idle | lookup | choose | password | sms-captcha | sms-code | loading
  const [loginInput, setLoginInput] = useState("");
  const [loginContext, setLoginContext] = useState(null);
  const [password, setPassword] = useState("");
  const [smsCode, setSmsCode] = useState("");
  const [captchaToken, setCaptchaToken] = useState(null);
  const [loginError, setLoginError] = useState("");
  const captchaRef = useRef(null);

  async function handleSleeperLookup() {
    if (!loginInput.trim()) return;
    setLoginStep("loading");
    setLoginError("");
    try {
      const res = await sleeperPost({
        operationName: "login_context",
        query: "query login_context($email_or_phone_or_username: String!) { login_context_by_email_or_phone_or_username(email_or_phone_or_username: $email_or_phone_or_username) }",
        variables: { email_or_phone_or_username: loginInput.trim() },
      });
      const ctx = res?.data?.login_context_by_email_or_phone_or_username;
      if (!ctx || !ctx.display_name) {
        setLoginError("User not found.");
        setLoginStep("lookup");
        return;
      }
      setLoginContext(ctx);
      setLoginStep("choose");
    } catch {
      setLoginError("Network error. Try again.");
      setLoginStep("lookup");
    }
  }

  async function handleSleeperLogin() {
    if (!captchaToken) return;
    setLoginStep("loading");
    setLoginError("");
    try {
      const res = await sleeperPost({
        operationName: "login",
        query: "query login($email_or_phone_or_username: String!, $password: String!, $captcha: String) { login(email_or_phone_or_username: $email_or_phone_or_username, password: $password, captcha: $captcha) { token } }",
        variables: { email_or_phone_or_username: loginInput.trim(), password, captcha: captchaToken },
      });
      const token = res?.data?.login?.token;
      if (!token) {
        setLoginError(res?.errors?.[0]?.message || "Login failed. Check password.");
        setLoginStep("password");
        setCaptchaToken(null);
        captchaRef.current?.resetCaptcha();
        return;
      }
      saveAuthAndReset(token);
    } catch {
      setLoginError("Network error. Try again.");
      setLoginStep("password");
      setCaptchaToken(null);
      captchaRef.current?.resetCaptcha();
    }
  }

  async function handleSendSmsCode() {
    if (!captchaToken) return;
    setLoginStep("loading");
    setLoginError("");
    try {
      await sleeperPost({
        operationName: "create_verification_code",
        query: "mutation create_verification_code($email_or_phone: String!, $captcha: String) { create_verification_code(email_or_phone: $email_or_phone, captcha: $captcha) }",
        variables: { email_or_phone: loginInput.trim(), captcha: captchaToken },
      });
      setCaptchaToken(null);
      setSmsCode("");
      setLoginStep("sms-code");
    } catch {
      setLoginError("Network error. Try again.");
      setLoginStep("sms-captcha");
      setCaptchaToken(null);
      captchaRef.current?.resetCaptcha();
    }
  }

  async function handleVerifySmsCode() {
    if (!smsCode.trim()) return;
    setLoginStep("loading");
    setLoginError("");
    try {
      const res = await sleeperPost({
        operationName: "login",
        query: "query login($email_or_phone_or_username: String!, $password: String!, $captcha: String) { login(email_or_phone_or_username: $email_or_phone_or_username, password: $password, captcha: $captcha) { token } }",
        variables: { email_or_phone_or_username: loginInput.trim(), password: smsCode.trim(), captcha: null },
      });
      const token = res?.data?.login?.token;
      if (!token) {
        setLoginError(res?.errors?.[0]?.message || "Invalid code.");
        setLoginStep("sms-code");
        return;
      }
      saveAuthAndReset(token);
    } catch {
      setLoginError("Network error. Try again.");
      setLoginStep("sms-code");
    }
  }

  function saveAuthAndReset(token) {
    const payload = decodeToken(token);
    const auth = { token, display_name: payload?.display_name || loginContext.display_name, user_id: payload?.user_id, exp: payload?.exp };
    localStorage.setItem("sleeper_auth", JSON.stringify(auth));
    setSleeperAuth(auth);
    setLoginStep("idle");
    setLoginInput("");
    setPassword("");
    setSmsCode("");
    setCaptchaToken(null);
    setLoginContext(null);
  }

  function handleSleeperDisconnect() {
    localStorage.removeItem("sleeper_auth");
    setSleeperAuth(null);
    setLoginStep("idle");
    setLoginInput("");
  }

  useEffect(() => {
    const saved = localStorage.getItem("FantasyHelperSettings");
    if (saved) {
      const parsed = JSON.parse(saved);
      // Restore username if present
      if (parsed.username) {
        setUsername(parsed.username);
      }
      // Restore defaultRankings if present
      if (parsed.defaultRankings) {
        setDefaultRankings(parsed.defaultRankings);
      }
    }
  }, []);

  const handleFileChange = (rankingKey, event) => {
    if (!event.target.files || event.target.files.length === 0) return;
    const file = event.target.files[0];
    // 1MB size limit
    if (file.size > 1_000_000) {
      alert("File exceeds 1MB limit. Please choose a smaller file.");
      return;
    }
    const reader = new FileReader();
    reader.onload = (e) => {
      const fileContent = e.target.result;
      setDefaultRankings((prev) => ({
        ...prev,
        [rankingKey]: { name: file.name, data: fileContent },
      }));
    };
    reader.readAsText(file);
  };

  const handleChooseClick = (rankingKey) => {
    document.getElementById(`file-input-${rankingKey}`).click();
  };

  /**
   * Resets all ranking keys to { name: "default", data: "" }
   * and sets theme back to "light", or any other defaults you prefer.
   */
  const handleResetDefaults = () => {
    setDefaultRankings({
      dynasty_sf: { name: "default", data: "" },
      dynasty_ppr: { name: "default", data: "" },
      dynasty_half_ppr: { name: "default", data: "" },
      redraft_sf: { name: "default", data: "" },
      redraft_ppr: { name: "default", data: "" },
      redraft_half_ppr: { name: "default", data: "" },
    });
    setUsername("");
    alert("Settings reset to defaults (REMEMBER to save).");
  };

  const handleSave = () => {
    // Include the new username in the object
    const settingsToSave = { username, defaultRankings };
    localStorage.setItem(
      "FantasyHelperSettings",
      JSON.stringify(settingsToSave)
    );
    console.log("Settings saved:", settingsToSave);
    alert("Settings saved!");
  };

  const handleThemeToggle = () => {
    const newTheme = theme === "light" ? "dark" : "light";
    setTheme(newTheme);
  };

  return (
    <div className={`settings-container ${theme}`}>
      <h1>Settings</h1>
      <hr className="separator" />

      <div className="settings-container">
        {/* NEW: Standard Username Field */}
        <div className="settings-field">
          <label htmlFor="standard-username">Standard username:</label>
          <input
            className="standard-username"
            id="standard-username"
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="Default username"
          />
        </div>
        <div className="separator-field">
          <hr className="separator" />
        </div>
        <div className="settings-field">
          <label>Default rankings</label>
        </div>

        {/* Rankings grid */}
        <div className="rankings-grid">
          {/* 1) Dynasty SF */}
          <div className="ranking-row">
            <div className="ranking-label">Dynasty SF</div>
            <div className="ranking-file">
              {defaultRankings.dynasty_sf.name}
              <input
                type="file"
                accept=".csv"
                id="file-input-dynasty_sf"
                style={{ display: "none" }}
                onChange={(e) => handleFileChange("dynasty_sf", e)}
              />
            </div>
            <button onClick={() => handleChooseClick("dynasty_sf")}>
              Choose
            </button>
          </div>
          {/* 2) Dynasty PPR */}
          <div className="ranking-row">
            <div className="ranking-label">Dynasty PPR</div>
            <div className="ranking-file">
              {defaultRankings.dynasty_ppr.name}
              <input
                type="file"
                accept=".csv"
                id="file-input-dynasty_ppr"
                style={{ display: "none" }}
                onChange={(e) => handleFileChange("dynasty_ppr", e)}
              />
            </div>
            <button onClick={() => handleChooseClick("dynasty_ppr")}>
              Choose
            </button>
          </div>
          {/* 3) Dynasty Half-PPR */}
          <div className="ranking-row">
            <div className="ranking-label">Dynasty Half-PPR</div>
            <div className="ranking-file">
              {defaultRankings.dynasty_half_ppr.name}
              <input
                type="file"
                accept=".csv"
                id="file-input-dynasty_half_ppr"
                style={{ display: "none" }}
                onChange={(e) => handleFileChange("dynasty_half_ppr", e)}
              />
            </div>
            <button onClick={() => handleChooseClick("dynasty_half_ppr")}>
              Choose
            </button>
          </div>
          {/* 4) Redraft SF */}
          <div className="ranking-row">
            <div className="ranking-label">Redraft SF</div>
            <div className="ranking-file">
              {defaultRankings.redraft_sf.name}
              <input
                type="file"
                accept=".csv"
                id="file-input-redraft_sf"
                style={{ display: "none" }}
                onChange={(e) => handleFileChange("redraft_sf", e)}
              />
            </div>
            <button onClick={() => handleChooseClick("redraft_sf")}>
              Choose
            </button>
          </div>
          {/* 5) Redraft PPR */}
          <div className="ranking-row">
            <div className="ranking-label">Redraft PPR</div>
            <div className="ranking-file">
              {defaultRankings.redraft_ppr.name}
              <input
                type="file"
                accept=".csv"
                id="file-input-redraft_ppr"
                style={{ display: "none" }}
                onChange={(e) => handleFileChange("redraft_ppr", e)}
              />
            </div>
            <button onClick={() => handleChooseClick("redraft_ppr")}>
              Choose
            </button>
          </div>
          {/* 6) Redraft Half-PPR */}
          <div className="ranking-row">
            <div className="ranking-label">Redraft Half-PPR</div>
            <div className="ranking-file">
              {defaultRankings.redraft_half_ppr.name}
              <input
                type="file"
                accept=".csv"
                id="file-input-redraft_half_ppr"
                style={{ display: "none" }}
                onChange={(e) => handleFileChange("redraft_half_ppr", e)}
              />
            </div>
            <button onClick={() => handleChooseClick("redraft_half_ppr")}>
              Choose
            </button>
          </div>
        </div>
        <div className="separator-field">
          <hr className="separator" />
        </div>

        <div className="separator-field">
          <hr className="separator" />
        </div>

        {/* Sleeper Account */}
        <div className="settings-field">
          <label>Sleeper Account</label>
          <span className="settings-field-hint">Login will enable more data and functions</span>
        </div>
        <div className="sleeper-auth-section">
          {sleeperAuth ? (
            <div className="sleeper-auth-connected">
              <span className="sleeper-auth-status connected">Connected as <strong>{sleeperAuth.display_name}</strong></span>
              {sleeperAuth.exp && (
                <span className="sleeper-auth-expiry">
                  Expires {new Date(sleeperAuth.exp * 1000).toLocaleDateString()}
                </span>
              )}
              <button className="sleeper-disconnect-btn" onClick={handleSleeperDisconnect}>Disconnect</button>
            </div>
          ) : loginStep === "idle" || loginStep === "lookup" ? (
            <div className="sleeper-auth-form">
              <input
                type="text"
                placeholder="Sleeper username or email"
                value={loginInput}
                onChange={e => { setLoginInput(e.target.value); setLoginStep("lookup"); }}
                onKeyDown={e => e.key === "Enter" && handleSleeperLookup()}
                className="sleeper-auth-input"
              />
              <button
                className="sleeper-connect-btn"
                onClick={handleSleeperLookup}
                disabled={!loginInput.trim()}
              >
                Connect
              </button>
              {loginError && <span className="sleeper-auth-error">{loginError}</span>}
            </div>
          ) : loginStep === "loading" ? (
            <div className="sleeper-auth-loading">Connecting…</div>
          ) : loginStep === "choose" ? (
            <div className="sleeper-auth-form">
              <div className="sleeper-auth-user">
                <strong>{loginContext?.display_name}</strong> — choose login method:
              </div>
              <div className="sleeper-auth-actions">
                <button className="sleeper-back-btn" onClick={() => { setLoginStep("lookup"); setLoginError(""); }}>← Back</button>
                <button className="sleeper-connect-btn" onClick={() => setLoginStep("password")}>
                  Password
                </button>
                {loginContext?.has_phone && (
                  <button className="sleeper-sms-btn" onClick={() => { setLoginStep("sms-captcha"); setLoginError(""); }}>
                    SMS to {loginContext.masked_phone}
                  </button>
                )}
              </div>
            </div>
          ) : loginStep === "password" ? (
            <div className="sleeper-auth-form">
              <div className="sleeper-auth-user">
                Password for <strong>{loginContext?.display_name}</strong>
              </div>
              <input
                type="password"
                placeholder="Password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                className="sleeper-auth-input"
              />
              <div className="sleeper-captcha">
                <HCaptcha
                  sitekey={HCAPTCHA_SITE_KEY}
                  onVerify={token => setCaptchaToken(token)}
                  onExpire={() => setCaptchaToken(null)}
                  ref={captchaRef}
                  theme="dark"
                />
              </div>
              <div className="sleeper-auth-actions">
                <button className="sleeper-back-btn" onClick={() => { setLoginStep("choose"); setPassword(""); setCaptchaToken(null); setLoginError(""); }}>← Back</button>
                <button className="sleeper-connect-btn" onClick={handleSleeperLogin} disabled={!captchaToken || !password}>
                  Login
                </button>
              </div>
              {loginError && <span className="sleeper-auth-error">{loginError}</span>}
            </div>
          ) : loginStep === "sms-captcha" ? (
            <div className="sleeper-auth-form">
              <div className="sleeper-auth-user">
                Send SMS code to <strong>{loginContext?.masked_phone}</strong>
              </div>
              <div className="sleeper-captcha">
                <HCaptcha
                  sitekey={HCAPTCHA_SITE_KEY}
                  onVerify={token => setCaptchaToken(token)}
                  onExpire={() => setCaptchaToken(null)}
                  ref={captchaRef}
                  theme="dark"
                />
              </div>
              <div className="sleeper-auth-actions">
                <button className="sleeper-back-btn" onClick={() => { setLoginStep("choose"); setCaptchaToken(null); setLoginError(""); }}>← Back</button>
                <button className="sleeper-connect-btn" onClick={handleSendSmsCode} disabled={!captchaToken}>
                  Send Code
                </button>
              </div>
              {loginError && <span className="sleeper-auth-error">{loginError}</span>}
            </div>
          ) : loginStep === "sms-code" ? (
            <div className="sleeper-auth-form">
              <div className="sleeper-auth-user">
                Enter the code sent to <strong>{loginContext?.masked_phone}</strong>
              </div>
              <input
                type="text"
                placeholder="Enter SMS code"
                value={smsCode}
                onChange={e => setSmsCode(e.target.value)}
                onKeyDown={e => e.key === "Enter" && handleVerifySmsCode()}
                className="sleeper-auth-input"
                maxLength={8}
              />
              <div className="sleeper-auth-actions">
                <button className="sleeper-back-btn" onClick={() => { setLoginStep("sms-captcha"); setSmsCode(""); setLoginError(""); }}>← Resend</button>
                <button className="sleeper-connect-btn" onClick={handleVerifySmsCode} disabled={!smsCode.trim()}>
                  Verify
                </button>
              </div>
              {loginError && <span className="sleeper-auth-error">{loginError}</span>}
            </div>
          ) : null}
        </div>

        <div className="separator-field">
          <hr className="separator" />
        </div>

        <div className="settings-field">
          <label>Dark Mode:</label>
          <div className="theme-toggle-wrapper" onClick={handleThemeToggle}>
            <div className={`theme-toggle ${theme}`}>
              <div className="toggle-circle">
                {theme === "light" ? (
                  <span className="sun-icon">☀️</span>
                ) : (
                  <span className="moon-icon">🌙</span>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Two buttons in one row: "Reset to Defaults" (red, left) & "Save" (right) */}
        <div className="settings-actions">
          <button className="reset-button" onClick={handleResetDefaults}>
            Reset to Defaults
          </button>
          <button className="save-button" onClick={handleSave}>
            Save
          </button>
        </div>
      </div>
    </div>
  );
}

export default Settings;
