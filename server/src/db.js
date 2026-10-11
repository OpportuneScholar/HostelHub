import dns from 'dns';
import mongoose from 'mongoose';

// Termux has no /etc/resolv.conf, so mongodb+srv lookups can fail. DNS_SERVERS works around it.
export function connectDb() {
  if (!process.env.MONGODB_URI) throw new Error('MONGODB_URI is not set');
  if (process.env.DNS_SERVERS) dns.setServers(process.env.DNS_SERVERS.split(',').map((s) => s.trim()));
  return mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 10000 });
}
