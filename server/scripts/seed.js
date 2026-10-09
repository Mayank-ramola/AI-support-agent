import mongoose from "mongoose";
import { config } from "../src/config.js";
import { connectDB } from "../src/db.js";
import Order from "../src/models/Order.js";

const day = 24 * 60 * 60 * 1000;
const ago = (d) => new Date(Date.now() - d * day);
const ahead = (d) => new Date(Date.now() + d * day);

const orders = [
  { orderNumber: "ORD-1001", email: "alex@example.com", status: "shipped", items: [{ name: "Black T-Shirt for Women", qty: 1, price: 59.99 }, { name: "Red Socks", qty: 2, price: 29.99 }], total: 119.97, carrier: "SwiftShip", trackingNumber: "SS482910377", placedAt: ago(3), estimatedDelivery: ahead(2) },
  { orderNumber: "ORD-1002", email: "priya@example.com", status: "processing", items: [{ name: "Men's Casual Hoodies", qty: 1, price: 70.99 }], total: 75.98, placedAt: ago(0.2) },
  { orderNumber: "ORD-1003", email: "sam@example.com", status: "delivered", items: [{ name: "Sports Wear", qty: 1, price: 138.99 }], total: 138.99, carrier: "SwiftShip", trackingNumber: "SS335571920", placedAt: ago(9), estimatedDelivery: ago(3) },
  { orderNumber: "ORD-1004", email: "maria@example.com", status: "cancelled", items: [{ name: "Jackets for Women", qty: 1, price: 100.99 }], total: 100.99, placedAt: ago(5) },
  { orderNumber: "ORD-1005", email: "jordan@example.com", status: "shipped", items: [{ name: "Gym Sweatpants", qty: 2, price: 56.99 }], total: 113.98, carrier: "SwiftShip", trackingNumber: "SS771204598", placedAt: ago(2), estimatedDelivery: ahead(4) },
];

await connectDB(config.mongoUri);
for (const o of orders) await Order.updateOne({ orderNumber: o.orderNumber }, o, { upsert: true });
console.log(`Seeded ${orders.length} sample orders:`);
orders.forEach((o) => console.log(`  ${o.orderNumber}  ${o.email}  ${o.status}`));
await mongoose.disconnect();
