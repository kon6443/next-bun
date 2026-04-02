import { forwardRef } from "react";

const baseInputStyles =
  "w-full rounded-xl border border-white/10 bg-slate-900/60 text-white placeholder-slate-500 focus:border-sky-500/50 focus:outline-none focus:ring-2 focus:ring-sky-500/20 disabled:cursor-not-allowed";

const labelStyles = "mb-2 block text-sm font-semibold text-slate-300";

type InputProps = {
  label: string;
  required?: boolean;
} & Omit<React.InputHTMLAttributes<HTMLInputElement>, "className">;

/**
 * 텍스트 입력 컴포넌트
 */
export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ label, required, id, ...props }, ref) => {
    return (
      <div>
        <label htmlFor={id} className={labelStyles}>
          {label} {required && <span className="text-red-400">*</span>}
        </label>
        <input
          ref={ref}
          id={id}
          className={`${baseInputStyles} px-4 py-3`}
          required={required}
          {...props}
        />
      </div>
    );
  }
);

Input.displayName = "Input";

type TextAreaProps = {
  label: string;
  required?: boolean;
  rows?: number;
} & Omit<React.TextareaHTMLAttributes<HTMLTextAreaElement>, "className">;

/**
 * 텍스트 영역 컴포넌트
 */
export const TextArea = forwardRef<HTMLTextAreaElement, TextAreaProps>(
  ({ label, required, id, rows = 6, ...props }, ref) => {
    return (
      <div>
        <label htmlFor={id} className={labelStyles}>
          {label} {required && <span className="text-red-400">*</span>}
        </label>
        <textarea
          ref={ref}
          id={id}
          rows={rows}
          className={`${baseInputStyles} resize-none p-4`}
          required={required}
          {...props}
        />
      </div>
    );
  }
);

TextArea.displayName = "TextArea";

type DateInputProps = {
  label: string;
} & Omit<React.InputHTMLAttributes<HTMLInputElement>, "className" | "type">;

/**
 * 날짜 입력 컴포넌트
 */
export const DateInput = forwardRef<HTMLInputElement, DateInputProps>(
  ({ label, id, ...props }, ref) => {
    return (
      <div className="min-w-0 w-full overflow-hidden">
        <label htmlFor={id} className={labelStyles}>
          {label}
        </label>
        <input
          ref={ref}
          id={id}
          type="date"
          className={`${baseInputStyles} w-full max-w-full box-border appearance-none px-4 py-3`}
          {...props}
        />
      </div>
    );
  }
);

DateInput.displayName = "DateInput";

type TimeInputProps = {
  label: string;
  id?: string;
  value?: string;
  onChange?: (e: { target: { value: string } }) => void;
  disabled?: boolean;
};

const HOURS = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, "0"));
const MINUTES = Array.from({ length: 60 }, (_, i) => String(i).padStart(2, "0"));

const selectStyles =
  "rounded-xl border border-white/10 bg-slate-900/60 text-white focus:border-sky-500/50 focus:outline-none focus:ring-2 focus:ring-sky-500/20 px-2 py-3 appearance-none text-center";

/**
 * 시간 입력 컴포넌트 (24시간 형식, HH:MM)
 * 시/분 select로 구성하여 브라우저 로케일에 무관하게 24시간 형식 보장
 */
export function TimeInput({ label, id, value = "00:00", onChange, disabled }: TimeInputProps) {
  const parts = (value || "00:00").split(":");
  const hour = parts[0] ?? "00";
  const minute = parts[1] ?? "00";

  const handleChange = (h: string, m: string) => {
    onChange?.({ target: { value: `${h}:${m}` } });
  };

  return (
    <div className="min-w-0">
      <label htmlFor={id} className={labelStyles}>
        {label}
      </label>
      <div className="flex items-center gap-1">
        <select
          id={id}
          value={hour}
          onChange={(e) => handleChange(e.target.value, minute)}
          disabled={disabled}
          className={`${selectStyles} w-16`}
        >
          {HOURS.map((h) => (
            <option key={h} value={h}>{h}</option>
          ))}
        </select>
        <span className="text-slate-500 text-sm">:</span>
        <select
          value={minute}
          onChange={(e) => handleChange(hour, e.target.value)}
          disabled={disabled}
          className={`${selectStyles} w-16`}
        >
          {MINUTES.map((m) => (
            <option key={m} value={m}>{m}</option>
          ))}
        </select>
      </div>
    </div>
  );
}
