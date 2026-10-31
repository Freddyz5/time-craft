// Short confirmations after an action ("Sesión pausada"), alerts the tab
// raises on its own (the warning and the end) and the news a push brought to
// an open tab (a request, an answer). They sit above the tab bar and
// announce themselves to screen readers.
import { Bell, CircleAlert, CircleCheck, Clock, X } from "lucide-react";
import {
	createContext,
	type ReactNode,
	useCallback,
	useContext,
	useMemo,
	useRef,
	useState,
} from "react";

type ToastTone = "success" | "error" | "alarm" | "notice";

interface Toast {
	id: number;
	tone: ToastTone;
	title: string;
	body?: string | undefined;
}

interface ToastOptions {
	// Stays until closed: it came while nobody was looking.
	sticky?: boolean;
}

interface ToastApi {
	show: (
		tone: ToastTone,
		title: string,
		body?: string,
		options?: ToastOptions,
	) => void;
}

const ToastContext = createContext<ToastApi>({ show: () => undefined });

export function useToast(): ToastApi {
	return useContext(ToastContext);
}

const DURATION: Record<ToastTone, number> = {
	success: 3500,
	error: 6000,
	// The tab's own alarm stays until dismissed: it may ring with nobody
	// looking.
	alarm: 0,
	notice: 8000,
};

export function ToastProvider({ children }: { children: ReactNode }) {
	const [toasts, setToasts] = useState<Toast[]>([]);
	const next = useRef(1);

	const dismiss = useCallback((id: number) => {
		setToasts((current) => current.filter((toast) => toast.id !== id));
	}, []);

	const show = useCallback(
		(tone: ToastTone, title: string, body?: string, options?: ToastOptions) => {
			const id = next.current++;
			setToasts((current) => [...current.slice(-2), { id, tone, title, body }]);
			if (DURATION[tone] > 0 && options?.sticky !== true) {
				setTimeout(() => dismiss(id), DURATION[tone]);
			}
		},
		[dismiss],
	);

	const value = useMemo(() => ({ show }), [show]);

	return (
		<ToastContext.Provider value={value}>
			{children}
			<div
				aria-live="polite"
				className="pointer-events-none fixed inset-x-0 bottom-[calc(6rem+env(safe-area-inset-bottom))] z-50 flex flex-col items-center gap-2 px-4 lg:bottom-6 lg:left-auto lg:right-6 lg:items-end"
			>
				{toasts.map((toast) => (
					<div
						key={toast.id}
						role={
							toast.tone === "success" || toast.tone === "notice"
								? "status"
								: "alert"
						}
						className={`pointer-events-auto flex w-full max-w-sm motion-safe:animate-rise items-start gap-3 rounded-callout border-[1.5px] px-4 py-3 ${
							toast.tone === "alarm"
								? "border-stop bg-ink text-on-ink shadow-[0_4px_0_var(--color-stop),0_22px_40px_-16px_var(--color-shadow)]"
								: toast.tone === "error"
									? "border-stop bg-sheet text-ink shadow-lift"
									: "border-rule bg-sheet text-ink shadow-lift"
						}`}
					>
						{toast.tone === "success" ? (
							<CircleCheck
								className="mt-0.5 size-5 shrink-0 text-balance"
								aria-hidden="true"
							/>
						) : toast.tone === "error" ? (
							<CircleAlert
								className="mt-0.5 size-5 shrink-0 text-stop"
								aria-hidden="true"
							/>
						) : toast.tone === "notice" ? (
							<Bell
								className="mt-0.5 size-5 shrink-0 text-ink"
								aria-hidden="true"
							/>
						) : (
							<Clock
								className="mt-0.5 size-5 shrink-0 text-bonus"
								aria-hidden="true"
							/>
						)}
						<div className="min-w-0 flex-1">
							<p className="font-bold">{toast.title}</p>
							{toast.body && (
								<p
									className={
										toast.tone === "alarm" ? "text-on-ink/80" : "text-ink-soft"
									}
								>
									{toast.body}
								</p>
							)}
						</div>
						<button
							type="button"
							onClick={() => dismiss(toast.id)}
							aria-label="Cerrar aviso"
							className="-m-1.5 grid size-9 shrink-0 place-items-center rounded-full opacity-80 hover:opacity-100"
						>
							<X className="size-4" aria-hidden="true" />
						</button>
					</div>
				))}
			</div>
		</ToastContext.Provider>
	);
}
