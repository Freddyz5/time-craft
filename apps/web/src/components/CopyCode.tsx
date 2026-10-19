// A secret shown once (the recovery code), with a copy button.
import { Check, Copy } from "lucide-react";
import { useState } from "react";
import { Button } from "./ui";

export function CopyCode({ code }: { code: string }) {
	const [copied, setCopied] = useState(false);
	return (
		<div className="flex flex-col gap-3 rounded-control border-[1.5px] border-dashed border-rule-strong bg-sheet-sunk p-4">
			<code className="tabular break-all text-center text-xl font-semibold tracking-[0.06em] select-all">
				{code}
			</code>
			<Button
				variant="secondary"
				size="sm"
				icon={
					copied ? (
						<Check className="size-4 text-balance" aria-hidden="true" />
					) : (
						<Copy className="size-4" aria-hidden="true" />
					)
				}
				onClick={() => {
					void navigator.clipboard
						?.writeText(code)
						.then(() => setCopied(true))
						.catch(() => undefined);
				}}
			>
				{copied ? "Copiado" : "Copiar código"}
			</Button>
		</div>
	);
}
