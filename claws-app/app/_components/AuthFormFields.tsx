'use client'

export function Field({
  label,
  hint,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement> & { label: string; hint?: string }) {
  return (
    <div>
      <label className="block text-xs font-medium mb-1 text-[#425d7f]">
        {label} <span className="text-[#006092]">*</span>
      </label>
      <input
        {...props}
        className="w-full px-3 py-2.5 rounded-lg text-[#12304f] text-sm outline-none transition-all placeholder:text-[#94afd5] bg-white border border-[#dde8f5] focus:border-[#006092] focus:ring-2 focus:ring-[#006092]/20"
      />
      {hint && <p className="mt-1 text-[11px] text-[#94afd5]">{hint}</p>}
    </div>
  )
}

interface PasswordFieldProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type'> {
  label:            string
  hint?:            string
  visible:          boolean
  onToggleVisible:  () => void
}

export function PasswordField({
  label,
  hint,
  visible,
  onToggleVisible,
  ...props
}: PasswordFieldProps) {
  return (
    <div>
      <label className="block text-xs font-medium mb-1 text-[#425d7f]">
        {label} <span className="text-[#006092]">*</span>
      </label>
      <div className="relative">
        <input
          {...props}
          type={visible ? 'text' : 'password'}
          className="w-full pl-3 pr-11 py-2.5 rounded-lg text-[#12304f] text-sm outline-none transition-all placeholder:text-[#94afd5] bg-white border border-[#dde8f5] focus:border-[#006092] focus:ring-2 focus:ring-[#006092]/20"
        />
        <button
          type="button"
          onClick={onToggleVisible}
          aria-label={visible ? 'Hide password' : 'Show password'}
          aria-pressed={visible}
          className="absolute inset-y-0 right-0 px-3 flex items-center text-[#94afd5] hover:text-[#425d7f] transition-colors"
        >
          <span className="material-symbols-outlined" style={{ fontSize: 20 }}>
            {visible ? 'visibility_off' : 'visibility'}
          </span>
        </button>
      </div>
      {hint && <p className="mt-1 text-[11px] text-[#94afd5]">{hint}</p>}
    </div>
  )
}
