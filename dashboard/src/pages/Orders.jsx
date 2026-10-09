import { api } from "../api.js";
import { usePolling } from "../usePolling.js";

export default function Orders() {
  const { data: orders, error } = usePolling(() => api("/orders"), 30000);
  return (
    <>
      <h1>Sample orders</h1>
      <p className="muted">These are the orders the agent can look up. A customer must give the order number and the matching email.</p>
      {error && <p className="error">{error}</p>}
      {orders?.length === 0 && <p className="callout">No orders yet. Run <code>npm run seed</code> on the server.</p>}
      {orders?.length > 0 && (
        <div className="table-wrap">
          <table>
            <thead><tr><th>Order</th><th>Email</th><th>Items</th><th>Total</th><th>Status</th><th>Tracking</th></tr></thead>
            <tbody>
              {orders.map((o) => (
                <tr key={o._id}>
                  <td className="mono">{o.orderNumber}</td>
                  <td>{o.email}</td>
                  <td>{o.items.map((i) => `${i.qty} × ${i.name}`).join(", ")}</td>
                  <td>${o.total.toFixed(2)}</td>
                  <td>{o.status}</td>
                  <td className="mono">{o.trackingNumber || "–"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
