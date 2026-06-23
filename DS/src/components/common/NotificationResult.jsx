export function NotificationResult({ result }) {
  if (!result?.message) {
    return null
  }

  return (
    <p className={result.type === 'error' ? 'inline-feedback is-error' : 'inline-feedback is-success'} role="status">
      {result.message}
    </p>
  )
}
