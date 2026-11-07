export default function FieldError({ message }) {
  return message ? <p className="mt-1.5 text-xs font-medium text-bad">{message}</p> : null;
}
