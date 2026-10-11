import { useEffect, useState } from "react";

type Theme = "auto" | "light" | "dark";
const NEXT: Record<Theme, Theme> = {
	auto: "light",
	light: "dark",
	dark: "auto",
};

function read(): Theme {
	try {
		const v = localStorage.getItem("railflow-theme");
		if (v === "light" || v === "dark") return v;
	} catch {
		// storage blocked: fall back to auto
	}
	return "auto";
}

export function ThemeToggle() {
	const [theme, setTheme] = useState<Theme>(read);

	useEffect(() => {
		const root = document.documentElement;
		if (theme === "auto") root.removeAttribute("data-theme");
		else root.setAttribute("data-theme", theme);
		try {
			localStorage.setItem("railflow-theme", theme);
		} catch {
			// storage blocked: theme still applies for this session
		}
	}, [theme]);

	return (
		<button type="button" onClick={() => setTheme(NEXT[theme])}>
			Theme: {theme}
		</button>
	);
}
