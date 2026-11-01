/** Renders proof text, turning http(s) links into safe external links. Everything else stays plain text. */
export function ProofText({ text }: { text: string }) {
  const parts = text.split(/(\s+)/)
  return (
    <span className="break-words text-xs" style={{ color: 'var(--ink-2)' }}>
      {parts.map((part, i) =>
        /^https?:\/\/\S+$/i.test(part) ? (
          <a
            key={i}
            href={part}
            target="_blank"
            rel="noopener noreferrer"
            className="underline"
            style={{ color: 'var(--accent-hover)' }}
          >
            {part.length > 48 ? `${part.slice(0, 45)}...` : part}
          </a>
        ) : (
          <span key={i}>{part}</span>
        ),
      )}
    </span>
  )
}
