import React, { useState, useEffect } from 'react';

const ALLOWED_EMAILS = [
  'caseyjenson01@gmail.com',
  'gsharma@vixio.com',
];
const ALLOWED_DOMAIN = 'vixio.com';

function getIdentityEmail() {
  return new Promise((resolve) => {
    // chrome.identity is only available in the real extension context
    if (typeof chrome === 'undefined' || !chrome.identity?.getProfileUserInfo) {
      // Dev/test fallback — allow through
      resolve({ email: 'dev@vixio.com', id: 'dev' });
      return;
    }
    chrome.identity.getProfileUserInfo({ accountStatus: 'ANY' }, (info) => {
      resolve(info || { email: '', id: '' });
    });
  });
}

export function AuthGate({ children }) {
  const [state, setState] = useState('checking'); // checking | allowed | denied

  useEffect(() => {
    getIdentityEmail().then(({ email }) => {
      const lower  = email?.toLowerCase() ?? '';
      const domain = lower.split('@')[1] ?? '';
      const allowed = ALLOWED_EMAILS.includes(lower) || domain === ALLOWED_DOMAIN;
      setState(allowed ? 'allowed' : 'denied');
    }).catch(() => setState('denied'));
  }, []);

  if (state === 'checking') {
    return (
      <div style={styles.wrap}>
        <div style={styles.card}>
          <VixioLogo />
          <p style={styles.msg}>Verifying access…</p>
        </div>
      </div>
    );
  }

  if (state === 'denied') {
    return (
      <div style={styles.wrap}>
        <div style={styles.card}>
          <VixioLogo />
          <div style={styles.lockIcon}>🔒</div>
          <h2 style={styles.title}>Access Restricted</h2>
          <p style={styles.msg}>
            This tool is only available to Vixio employees.<br />
            Please sign into Chrome with your <strong>@vixio.com</strong> Google account.
          </p>
          <p style={styles.sub}>
            Need access? Contact <a href="mailto:it@vixio.com" style={styles.link}>it@vixio.com</a>
          </p>
        </div>
      </div>
    );
  }

  return children;
}

function VixioLogo() {
  return (
    <div style={styles.brand}>VIXIO</div>
  );
}

const styles = {
  wrap: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    height: '100vh',
    background: 'linear-gradient(135deg, #1a3a8a 0%, #1060a0 50%, #0d7a72 100%)',
  },
  card: {
    background: '#fff',
    borderRadius: 12,
    padding: '32px 28px',
    width: 300,
    textAlign: 'center',
    boxShadow: '0 8px 32px rgba(0,0,0,0.18)',
  },
  brand: {
    fontSize: 13,
    fontWeight: 800,
    letterSpacing: '0.15em',
    color: '#1a3a8a',
    marginBottom: 16,
  },
  lockIcon: {
    fontSize: 32,
    marginBottom: 12,
  },
  title: {
    fontSize: 16,
    fontWeight: 700,
    color: '#1a1a2e',
    marginBottom: 10,
  },
  msg: {
    fontSize: 12,
    color: '#475569',
    lineHeight: 1.6,
    marginBottom: 12,
  },
  sub: {
    fontSize: 11,
    color: '#94a3b8',
  },
  link: {
    color: '#1a7bb9',
    textDecoration: 'none',
  },
};
