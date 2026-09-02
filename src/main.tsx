import {StrictMode, Component} from 'react';
import {createRoot} from 'react-dom/client';
import App, { APP_VERSION } from './App.tsx';
import './index.css';
import { Activity } from 'lucide-react';

// Error Boundary Component
class ErrorBoundary extends Component<any, any> {
  public state: any;
  public props: any;

  constructor(props: any) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: any) {
    return { hasError: true, error };
  }

  componentDidCatch(error: any, errorInfo: any) {
    console.error("Uncaught error:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return null;
    }

    return this.props.children;
  }
}

// Global log storage for on-screen debugging
const debugLogs: string[] = [];
const originalLog = console.log;
const originalError = console.error;
const originalWarn = console.warn;

const formatLog = (args: any[]) => {
  return args.map(arg => {
    if (arg instanceof Error) return arg.message;
    if (typeof arg === 'object' && arg !== null) {
      try { 
        const str = JSON.stringify(arg);
        return str === '{}' ? `[Object: ${Object.keys(arg).join(',') || 'empty'}]` : str;
      } catch (e) { return '[Circular Object]'; }
    }
    return String(arg);
  }).join(' ');
};

console.log = (...args) => {
  debugLogs.push(`[LOG] ${formatLog(args)}`);
  originalLog.apply(console, args);
};
console.error = (...args) => {
  debugLogs.push(`[ERR] ${formatLog(args)}`);
  originalError.apply(console, args);
};
console.warn = (...args) => {
  debugLogs.push(`[WRN] ${formatLog(args)}`);
  originalWarn.apply(console, args);
};

// Expose logs to window for App.tsx to access
(window as any).getDebugLogs = () => debugLogs;

console.log("[DEBUG] main.tsx executing...");

// Global error handler for early script errors
window.onerror = (message, source, lineno, colno, error) => {
  console.error("🔴 [FATAL] Global Error:", { message, source, lineno, colno, error });
  return true; // Prevent default browser error display
};

window.onunhandledrejection = (event) => {
  const reason = event.reason;
  let reasonMsg = "No reason provided";
  
  if (reason !== undefined && reason !== null) {
    if (reason instanceof Error) {
      reasonMsg = `${reason.name}: ${reason.message}\n${reason.stack}`;
    } else if (typeof reason === 'object') {
      try {
        reasonMsg = JSON.stringify(reason);
      } catch (e) {
        reasonMsg = "[Circular Object]";
      }
    } else {
      reasonMsg = String(reason);
    }
  }

  // Silence specific benign errors that are hard to catch at the source
  if (reasonMsg.includes("adsbygoogle") || reasonMsg.includes("WebSocket closed") || reasonMsg === "No reason provided") {
    return;
  }

  console.error("🔴 [FATAL] Unhandled Rejection:", reasonMsg);
  
  event.preventDefault(); // Prevent default browser error display
};



createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
);
console.log("[DEBUG] main.tsx render called.");
