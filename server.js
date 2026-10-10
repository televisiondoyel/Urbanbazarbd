'use strict';
require('dotenv').config();
const express = require('express');
const session = require('express-session');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const bcrypt = require('bcryptjs');
const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = Number(process.env.PORT || 3000);
const ROOT = __dirname;
const DATA_DIR = path.join(ROOT, 'data');
fs.mkdirSync(DATA_DIR, { recursive: true });
const db = new Database(path.join(DATA_DIR, 'urban-bazar.sqlite'));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

const schema = `
CREATE TABLE IF NOT EXISTS admins (id INTEGER PRIMARY KEY AUTOINCREMENT, username TEXT UNIQUE NOT NULL, password_hash TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS products (
 id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, category TEXT NOT NULL DEFAULT 'অন্যান্য',
 description TEXT NOT NULL DEFAULT '', price REAL NOT NULL CHECK(price >= 0), unit TEXT NOT NULL DEFAULT 'পিস',
 stock REAL NOT NULL DEFAULT 0 CHECK(stock >= 0), image TEXT NOT NULL DEFAULT '', active INTEGER NOT NULL DEFAULT 1,
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS orders (
 id INTEGER PRIMARY KEY AUTOINCREMENT, customer_name TEXT NOT NULL, phone TEXT NOT NULL, address TEXT NOT NULL,
 area TEXT NOT NULL, notes TEXT NOT NULL DEFAULT '', subtotal REAL NOT NULL, delivery_fee REAL NOT NULL,
 total REAL NOT NULL, payment_method TEXT NOT NULL DEFAULT 'cod', status TEXT NOT NULL DEFAULT 'new',
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS order_items (
 id INTEGER PRIMARY KEY AUTOINCREMENT, order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
 product_id INTEGER REFERENCES products(id) ON DELETE SET NULL, product_name TEXT NOT NULL,
 quantity REAL NOT NULL, unit TEXT NOT NULL, unit_price REAL NOT NULL, line_total REAL NOT NULL
);
CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
`;
db.exec(schema);

const starterProducts = [
 ['মিনিকেট চাল','চাল, ডাল ও শস্য', 'পরিষ্কার মানসম্মত চাল।',68,'কেজি',120,'https://images.unsplash.com/photo-1586201375761-83865001e31c?auto=format&fit=crop&w=700&q=80'],
 ['মসুর ডাল','চাল, ডাল ও শস্য','দৈনন্দিন রান্নার মসুর ডাল।',125,'কেজি',70,'https://images.unsplash.com/photo-1515543904379-3d757brew?auto=format&fit=crop&w=700&q=80'],
 ['সয়াবিন তেল','তেল ও মসলা','রান্নার জন্য সয়াবিন তেল।',175,'লিটার',60,'https://images.unsplash.com/photo-1474979266404-7eaacbcd87c5?auto=format&fit=crop&w=700&q=80'],
 ['আলু','শাকসবজি ও ফল','প্রতিদিনের তাজা আলু।',35,'কেজি',100,'https://images.unsplash.com/photo-1518977676601-b53f82aba655?auto=format&fit=crop&w=700&q=80'],
 ['পেঁয়াজ','শাকসবজি ও ফল','রান্নার প্রয়োজনীয় পেঁয়াজ।',60,'কেজি',80,'https://images.unsplash.com/photo-1508747703725-719777637510?auto=format&fit=crop&w=700&q=80'],
 ['ডিম','মাছ, মাংস ও ডিম','খামারের মুরগির ডিম।',14,'পিস',200,'https://images.unsplash.com/photo-1506976785307-8732e854ad03?auto=format&fit=crop&w=700&q=80'],
 ['দুধ','দুধ ও দুগ্ধজাত','দৈনন্দিন ব্যবহারের দুধ।',100,'লিটার',30,'https://images.unsplash.com/photo-1563636619-e9143da7973b?auto=format&fit=crop&w=700&q=80'],
 ['কলা','শাকসবজি ও ফল','পাকা কলা।',80,'ডজন',40,'https://images.unsplash.com/photo-1571771894821-ce9b6c11b08e?auto=format&fit=crop&w=700&q=80']
];
if (db.prepare('SELECT COUNT(*) AS n FROM products').get().n === 0) {
 const insert = db.prepare('INSERT INTO products(name,category,description,price,unit,stock,image) VALUES(?,?,?,?,?,?,?)');
 const tx = db.transaction(rows => rows.forEach(p => insert.run(...p)));
 tx(starterProducts);
}
const settingDefaults = { delivery_fee: String(process.env.DELIVERY_FEE || '30'), store_name: process.env.STORE_NAME || 'আরবান বাজার', delivery_areas: 'সন্দ্বীপের সকল এলাকা' };
const insertSetting = db.prepare('INSERT OR IGNORE INTO settings(key,value) VALUES(?,?)');
Object.entries(settingDefaults).forEach(([k,v]) => insertSetting.run(k,v));

async function ensureAdmin() {
 const username = process.env.ADMIN_USERNAME || 'admin';
 const password = process.env.ADMIN_PASSWORD || 'ChangeThisPassword-Immediately-123!';
 const existing = db.prepare('SELECT id FROM admins WHERE username=?').get(username);
 if (!existing) db.prepare('INSERT INTO admins(username,password_hash) VALUES(?,?)').run(username, await bcrypt.hash(password, 12));
 if (process.env.NODE_ENV === 'production' && (!process.env.SESSION_SECRET || process.env.SESSION_SECRET.length < 32)) {
   throw new Error('Production requires SESSION_SECRET with at least 32 characters.');
 }
}

app.disable('x-powered-by');
app.use(helmet({ contentSecurityPolicy: false }));
app.use(express.json({ limit: '200kb' }));
app.use(express.urlencoded({ extended: false, limit: '50kb' }));
app.use(session({
 secret: process.env.SESSION_SECRET || 'local-development-secret-change-before-deployment-12345',
 resave: false, saveUninitialized: false,
 cookie: { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', maxAge: 1000*60*60*8 }
}));
const loginLimiter = rateLimit({ windowMs: 15*60*1000, limit: 10, standardHeaders: true, legacyHeaders: false, message: { error: 'অনেকবার চেষ্টা করা হয়েছে। কিছুক্ষণ পরে আবার চেষ্টা করুন।' } });
const orderLimiter = rateLimit({ windowMs: 10*60*1000, limit: 20, standardHeaders: true, legacyHeaders: false });
app.use(express.static(path.join(ROOT, 'public')));
function adminOnly(req,res,next) { if (!req.session.adminId) return res.status(401).json({error:'অ্যাডমিন হিসেবে লগইন করুন।'}); next(); }
function validText(value, max=250) { return typeof value === 'string' && value.trim().length > 0 && value.trim().length <= max; }
function money(n) { return Math.round((Number(n) + Number.EPSILON) * 100) / 100; }
function setting(key) { const r = db.prepare('SELECT value FROM settings WHERE key=?').get(key); return r ? r.value : ''; }
function productForCustomer(p) { return { ...p, price: Number(p.price), stock: Number(p.stock), active: Boolean(p.active) }; }

app.get('/api/store', (req,res) => res.json({ name: setting('store_name'), deliveryFee: Number(setting('delivery_fee') || 30), deliveryAreas: setting('delivery_areas') }));
app.get('/api/products', (req,res) => {
 const { category, q } = req.query; let sql = 'SELECT * FROM products WHERE active=1'; const args=[];
 if (category && category !== 'সব') { sql += ' AND category=?'; args.push(String(category).slice(0,80)); }
 if (q) { sql += ' AND (name LIKE ? OR category LIKE ? OR description LIKE ?)'; const term = `%${String(q).slice(0,80)}%`; args.push(term,term,term); }
 sql += ' ORDER BY id DESC'; res.json(db.prepare(sql).all(...args).map(productForCustomer));
});
app.get('/api/categories', (req,res) => res.json(['সব', ...db.prepare('SELECT DISTINCT category FROM products WHERE active=1 ORDER BY category').all().map(x=>x.category)]));
app.post('/api/orders', orderLimiter, (req,res) => {
 const { customerName, phone, address, area, notes='', items, paymentMethod='cod' } = req.body || {};
 if (!validText(customerName,100) || !/^\+?[0-9\s-]{8,20}$/.test(String(phone||'')) || !validText(address,500) || !validText(area,100)) return res.status(400).json({error:'নাম, সঠিক মোবাইল নম্বর, ঠিকানা ও এলাকা পূরণ করুন।'});
 if (!Array.isArray(items) || items.length < 1 || items.length > 60) return res.status(400).json({error:'কার্টে অন্তত একটি পণ্য থাকতে হবে।'});
 if (paymentMethod !== 'cod') return res.status(400).json({error:'এই সংস্করণে শুধু ক্যাশ অন ডেলিভারি চালু আছে।'});
 const getProduct = db.prepare('SELECT * FROM products WHERE id=? AND active=1');
 const insertOrder = db.prepare('INSERT INTO orders(customer_name,phone,address,area,notes,subtotal,delivery_fee,total,payment_method) VALUES(?,?,?,?,?,?,?,?,?)');
 const insertItem = db.prepare('INSERT INTO order_items(order_id,product_id,product_name,quantity,unit,unit_price,line_total) VALUES(?,?,?,?,?,?,?)');
 const updateStock = db.prepare('UPDATE products SET stock=stock-?, updated_at=CURRENT_TIMESTAMP WHERE id=? AND stock>=?');
 try {
  const result = db.transaction(() => {
   let subtotal=0; const lines=[];
   for (const item of items) {
    const id=Number(item.productId), quantity=Number(item.quantity);
    if (!Number.isInteger(id) || !Number.isFinite(quantity) || quantity <= 0 || quantity > 1000) throw new Error('পণ্যের পরিমাণ সঠিক নয়।');
    const p=getProduct.get(id); if (!p) throw new Error('একটি পণ্য আর পাওয়া যাচ্ছে না। পৃষ্ঠা রিফ্রেশ করুন।');
    if (p.stock < quantity) throw new Error(`${p.name}: পর্যাপ্ত স্টক নেই।`);
    const lineTotal=money(Number(p.price)*quantity); subtotal=money(subtotal+lineTotal);
    lines.push({p,quantity,lineTotal});
   }
   const fee=Number(setting('delivery_fee') || 30); const total=money(subtotal+fee);
   const order=insertOrder.run(customerName.trim(),String(phone).trim(),address.trim(),area.trim(),String(notes).slice(0,500),subtotal,fee,total,'cod');
   for (const line of lines) {
    insertItem.run(order.lastInsertRowid,line.p.id,line.p.name,line.quantity,line.p.unit,line.p.price,line.lineTotal);
    const upd=updateStock.run(line.quantity,line.p.id,line.quantity); if (!upd.changes) throw new Error(`${line.p.name}: স্টক আপডেট করা যায়নি। আবার চেষ্টা করুন।`);
   }
   return { orderId: Number(order.lastInsertRowid), subtotal, deliveryFee: fee, total };
  })();
  res.status(201).json({message:'আপনার অর্ডার গ্রহণ করা হয়েছে।', ...result});
 } catch(e) { res.status(400).json({error:e.message || 'অর্ডার সম্পন্ন করা যায়নি।'}); }
});
app.post('/api/admin/login', loginLimiter, async (req,res) => {
 const {username,password}=req.body||{};
 if (!validText(username,100) || typeof password !== 'string' || password.length > 200) return res.status(400).json({error:'ইউজারনেম ও পাসওয়ার্ড দিন।'});
 const user=db.prepare('SELECT * FROM admins WHERE username=?').get(username.trim());
 if (!user || !(await bcrypt.compare(password,user.password_hash))) return res.status(401).json({error:'ইউজারনেম অথবা পাসওয়ার্ড সঠিক নয়।'});
 req.session.regenerate(err => { if(err) return res.status(500).json({error:'লগইন করা যায়নি।'}); req.session.adminId=user.id; req.session.username=user.username; res.json({username:user.username}); });
});
app.get('/api/admin/me', (req,res) => req.session.adminId ? res.json({username:req.session.username}) : res.status(401).json({error:'লগইন প্রয়োজন।'}));
app.post('/api/admin/logout', adminOnly, (req,res) => req.session.destroy(()=>res.json({ok:true})));
app.get('/api/admin/products', adminOnly, (req,res) => res.json(db.prepare('SELECT * FROM products ORDER BY id DESC').all().map(productForCustomer)));
app.post('/api/admin/products', adminOnly, (req,res) => {
 const p=req.body||{}; const price=Number(p.price),stock=Number(p.stock);
 if (!validText(p.name,150)||!validText(p.category,80)||!validText(p.unit,30)||!Number.isFinite(price)||price<0||!Number.isFinite(stock)||stock<0) return res.status(400).json({error:'পণ্যের নাম, ক্যাটাগরি, একক, দাম ও স্টক সঠিকভাবে দিন।'});
 if (p.image && (!validText(p.image,1000) || !/^https:\/\//i.test(p.image))) return res.status(400).json({error:'ছবির URL অবশ্যই https:// দিয়ে শুরু হতে হবে।'});
 const r=db.prepare('INSERT INTO products(name,category,description,price,unit,stock,image,active) VALUES(?,?,?,?,?,?,?,?)').run(p.name.trim(),p.category.trim(),String(p.description||'').slice(0,2000),money(price),p.unit.trim(),stock,p.image||'',p.active===false?0:1);
 res.status(201).json(productForCustomer(db.prepare('SELECT * FROM products WHERE id=?').get(r.lastInsertRowid)));
});
app.put('/api/admin/products/:id', adminOnly, (req,res) => {
 const p=req.body||{}, id=Number(req.params.id), price=Number(p.price),stock=Number(p.stock);
 if (!Number.isInteger(id)||!validText(p.name,150)||!validText(p.category,80)||!validText(p.unit,30)||!Number.isFinite(price)||price<0||!Number.isFinite(stock)||stock<0) return res.status(400).json({error:'পণ্যের তথ্য সঠিক নয়।'});
 if (p.image && (!validText(p.image,1000)||!/^https:\/\//i.test(p.image))) return res.status(400).json({error:'ছবির URL অবশ্যই https:// দিয়ে শুরু হতে হবে।'});
 const r=db.prepare('UPDATE products SET name=?,category=?,description=?,price=?,unit=?,stock=?,image=?,active=?,updated_at=CURRENT_TIMESTAMP WHERE id=?').run(p.name.trim(),p.category.trim(),String(p.description||'').slice(0,2000),money(price),p.unit.trim(),stock,p.image||'',p.active===false?0:1,id);
 if (!r.changes) return res.status(404).json({error:'পণ্য পাওয়া যায়নি।'}); res.json(productForCustomer(db.prepare('SELECT * FROM products WHERE id=?').get(id)));
});
app.delete('/api/admin/products/:id', adminOnly, (req,res) => { const r=db.prepare('UPDATE products SET active=0,updated_at=CURRENT_TIMESTAMP WHERE id=?').run(Number(req.params.id)); if(!r.changes)return res.status(404).json({error:'পণ্য পাওয়া যায়নি।'}); res.json({ok:true}); });
app.get('/api/admin/orders', adminOnly, (req,res) => {
 const orders=db.prepare('SELECT * FROM orders ORDER BY id DESC LIMIT 500').all(); const getItems=db.prepare('SELECT * FROM order_items WHERE order_id=?');
 res.json(orders.map(o=>({...o,subtotal:Number(o.subtotal),delivery_fee:Number(o.delivery_fee),total:Number(o.total),items:getItems.all(o.id)})));
});
app.patch('/api/admin/orders/:id/status', adminOnly, (req,res) => {
 const allowed=['new','confirmed','packing','out_for_delivery','delivered','cancelled']; const status=req.body?.status;
 if(!allowed.includes(status))return res.status(400).json({error:'স্ট্যাটাস সঠিক নয়।'});
 const id=Number(req.params.id); const order=db.prepare('SELECT * FROM orders WHERE id=?').get(id); if(!order)return res.status(404).json({error:'অর্ডার পাওয়া যায়নি।'});
 if(order.status==='cancelled' && status!=='cancelled') return res.status(400).json({error:'বাতিল অর্ডার পুনরায় চালু করতে নতুন অর্ডার তৈরি করুন।'});
 if(status==='cancelled' && order.status!=='cancelled') {
  db.transaction(()=>{ const items=db.prepare('SELECT product_id,quantity FROM order_items WHERE order_id=?').all(id); const restore=db.prepare('UPDATE products SET stock=stock+?,updated_at=CURRENT_TIMESTAMP WHERE id=?'); items.forEach(i=>{if(i.product_id)restore.run(i.quantity,i.product_id);}); db.prepare('UPDATE orders SET status=? WHERE id=?').run(status,id); })();
 } else db.prepare('UPDATE orders SET status=? WHERE id=?').run(status,id);
 res.json({ok:true,status});
});
app.get('/api/admin/settings', adminOnly, (req,res) => res.json({store_name:setting('store_name'),delivery_fee:Number(setting('delivery_fee')||30),delivery_areas:setting('delivery_areas')}));
app.put('/api/admin/settings', adminOnly, (req,res) => {
 const p=req.body||{}, fee=Number(p.delivery_fee);
 if(!validText(p.store_name,100)||!validText(p.delivery_areas,500)||!Number.isFinite(fee)||fee<0||fee>10000)return res.status(400).json({error:'সেটিংসের তথ্য সঠিক নয়।'});
 const set=db.prepare('INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value');
 set.run('store_name',p.store_name.trim());set.run('delivery_fee',String(money(fee)));set.run('delivery_areas',p.delivery_areas.trim());res.json({ok:true});
});
app.get('/admin', (req,res)=>res.sendFile(path.join(ROOT,'public','admin.html')));
app.get('*', (req,res)=>res.sendFile(path.join(ROOT,'public','index.html')));

ensureAdmin().then(()=>app.listen(PORT,()=>console.log(`Urban Bazar running at http://localhost:${PORT}`))).catch(err=>{console.error(err);process.exit(1);});
