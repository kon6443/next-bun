import { forwardRef } from "react";

const baseInputStyles =
  "w-full rounded-xl border border-white/10 bg-slate-900/60 text-white placeholder-slate-500 focus:border-sky-500/50 focus:outline-none focus:ring-2 focus:ring-sky-500/20";

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
      <div className="min-w-0 overflow-hidden">
        <label htmlFor={id} className={labelStyles}>
          {label}
        </label>
        <input
          ref={ref}
          id={id}
          type="date"
          className={`${baseInputStyles} max-w-full w-full box-border px-4 py-3`}
          {...props}
        />
      </div>
    );
  }
);

DateInput.displayName = "DateInput";
