import { createRoot } from "react-dom/client";
import "./polyfills.ts";
import App from "./App.tsx";
import "./index.css";

createRoot(document.getElementById("root")!).render(<App />);
