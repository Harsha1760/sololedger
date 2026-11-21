const UPI_ID = 'apexstudios@upi';
const PAYEE = 'Apex%20Studios';

// Builds a UPI payment deep link. Amount and note are optional.
export function buildUpiUri({ amount, note } = {}) {
  let uri = `upi://pay?pa=${UPI_ID}&pn=${PAYEE}&cu=INR`;
  if (Number.isFinite(Number(amount)) && Number(amount) > 0) uri += `&am=${Number(amount)}`;
  if (note && String(note).trim()) uri += `&tn=${encodeURIComponent(String(note).trim())}`;
  return uri;
}

// QR rendered by an external image service (api.qrserver.com).
export default function UpiQr({ amount, note, size = 176 }) {
  const data = encodeURIComponent(buildUpiUri({ amount, note }));
  const src = `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&margin=8&data=${data}`;
  return (
    <div className="inline-flex rounded-lg bg-white p-2 ring-1 ring-slate-200">
      <img src={src} alt="UPI QR code for Apex Studios" width={size} height={size} className="block" />
    </div>
  );
}
