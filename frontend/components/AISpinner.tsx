export function AISpinner({ size = 14 }: { size?: number }) {
  const cls = size <= 14 ? "ai-spinner ai-spinner-sm"
            : size <= 20 ? "ai-spinner ai-spinner-md"
            :              "ai-spinner ai-spinner-lg";
  return <span className={cls} style={{ width: size, height: size }} aria-label="Loading" />;
}
