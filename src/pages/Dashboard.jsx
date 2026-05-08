// deno-lint-ignore-file
// deno-lint-ignore-file no-case-declarations
// src/Dashboard.jsx
import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '../lib/supabaseClient.js';
import AdminOrders from "./AdminOrders.jsx";
import AdminProducts from "./AdminProducts.jsx";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { User, Settings, LogOut } from "lucide-react";
import AdminSalesReport from './AdminSalesReport.jsx';
import AdminDiscounts from './AdminDiscounts.jsx';
import Account from './Account.jsx';
import AdminSellProducts from './AdminSellProducts.jsx';
import AdminCustomerList from './AdminCustomerList.jsx';
import { useNavigate } from "react-router-dom";
import Swal from "sweetalert2";
import withReactContent from "sweetalert2-react-content";
import productIcon from '../assets/product_icon.png';
import customerIcon from '../assets/customer_icon.png';
import lowStockIcon from '../assets/low_stock.png';

const MySwal = withReactContent(Swal);


import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
  BarChart,
  Bar,
} from "recharts";
import AdminPaymentOptions from './AdminPaymentOptions.jsx';

export default function Dashboard() {
  const [adminName, setAdminName] = useState('Admin');
  const [activeTab, setActiveTab] = useState('Home');
  const [products, setProducts] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  
  // -------------------- CHART STATES ADDED --------------------
  const [salesData, setSalesData] = useState([]);
  const [ordersData, setOrdersData] = useState([]);
  const [salesFilter, setSalesFilter] = useState("weekly");
  const [orderFilter, setOrderFilter] = useState("weekly");
  const [showProfileMenu, setShowProfileMenu] = useState(false);


const [stockFilter, setStockFilter] = useState("All");
const [movingFilter, setMovingFilter] = useState("All");

  const [showProductModal, setShowProductModal] = useState(false);
  const [newProduct, setNewProduct] = useState({
    id: null,
    name: '',
    description: '',
    price: '',
    stock: '',
    category: 'Hair Product',
    imageFile: null,
    image_url: ''
  });

  const LOW_STOCK_THRESHOLD = 100;
  // derive current admin id from auth session instead of hardcoding
  const [adminId, setAdminId] = useState(null);

  // -------------------- FETCH FUNCTIONS --------------------
  const fetchAdminName = async () => {
    const { data, error } = await supabase.auth.getUser();
    if (!error && data?.user?.user_metadata?.full_name) {
      setAdminName(data.user.user_metadata.full_name);
      // set current admin id for messages / realtime usage
      setAdminId(data.user.id);
    }
  };

  const fetchProducts = async () => {
    const { data, error } = await supabase
      .from('products')
      .select('*')
      .order('created_at', { ascending: false });
    if (!error) setProducts(data || []);
  };

  const fetchCustomers = async () => {
    const { data, error } = await supabase
      .from('customers')
      .select('*')
      .order('id', { ascending: true });
    if (error) {
      console.error('Failed to fetch customers:', error.message);
      return;
    }
    setCustomers(data);
  };

// -------------------- FETCH SALES (Completed Sales) --------------------
const fetchCompletedSales = async () => {
  const { data, error } = await supabase
    .from("sales")
    .select("id, total, date, sold_by") // use 'date' instead of 'created_at'
    .order("date", { ascending: true });

  if (error) {
    console.error("Error fetching completed sales:", error.message);
    return [];
  }

  console.log("Fetched sales:", data); // debug
  return data || [];
};

// -------------------- FETCH ORDERS (All Statuses) --------------------
const fetchAllOrders = async () => {
  const { data, error } = await supabase
    .from("orders")
    .select("id, created_at, status")
    .in("status", ["Pending", "Paid", "To Ship", "To Receive", "Completed", "Cancelled"])
    .order("created_at", { ascending: true });

  if (error) {
    console.error("Error fetching orders:", error.message);
    return [];
  }
  return data || [];
};

// -------------------- PREPARE CHART DATA --------------------
const prepareChartData = async () => {
  setLoading(true);
  const [completedSales, allOrders] = await Promise.all([fetchCompletedSales(), fetchAllOrders()]);

  const toStartOfDay = (d) => { const x = new Date(d); x.setHours(0,0,0,0); return x; };
  const toEndOfDay = (d) => { const x = new Date(d); x.setHours(23,59,59,999); return x; };

  // Return inclusive start/end for the selected filter anchored to "now"
  const rangeForFilter = (filter) => {
    const now = new Date();
    if (filter === "daily") {
      return { start: toStartOfDay(now), end: toEndOfDay(now) };
    }
    if (filter === "weekly") {
      const s = toStartOfDay(now);
      s.setDate(s.getDate() - s.getDay()); // Sunday
      const e = new Date(s); e.setDate(s.getDate() + 6);
      return { start: toStartOfDay(s), end: toEndOfDay(e) };
    }
    if (filter === "monthly") {
      const s = new Date(now.getFullYear(), now.getMonth(), 1);
      const e = new Date(now.getFullYear(), now.getMonth() + 1, 0);
      return { start: toStartOfDay(s), end: toEndOfDay(e) };
    }
    // yearly
    const s = new Date(now.getFullYear(), 0, 1);
    const e = new Date(now.getFullYear(), 11, 31);
    return { start: toStartOfDay(s), end: toEndOfDay(e) };
  };

  const salesRange = rangeForFilter(salesFilter);
  const orderRange = rangeForFilter(orderFilter);

  const generatePeriods = (filter, startDt, endDt) => {
    const periods = [];
    if (filter === "daily") {
      // single day -> one bucket (label is date)
      const label = startDt.toLocaleDateString("en-PH");
      periods.push({ label, start: startDt, end: endDt, ts: startDt.getTime() });
      return periods;
    }
    if (filter === "weekly") {
      // days of the week within start..end (7 days)
      const cur = new Date(startDt);
      for (let i = 0; i < 7; i++) {
        const day = new Date(cur);
        day.setDate(startDt.getDate() + i);
        const s = toStartOfDay(day);
        const e = toEndOfDay(day);
        const label = s.toLocaleDateString("en-PH");
        periods.push({ label, start: s, end: e, ts: s.getTime() });
      }
      return periods;
    }
    if (filter === "monthly") {
      // every day of the month
      const s = new Date(startDt.getFullYear(), startDt.getMonth(), 1);
      const last = new Date(startDt.getFullYear(), startDt.getMonth() + 1, 0).getDate();
      for (let d = 1; d <= last; d++) {
        const day = new Date(startDt.getFullYear(), startDt.getMonth(), d);
        const sDay = toStartOfDay(day);
        const eDay = toEndOfDay(day);
        const label = sDay.toLocaleDateString("en-PH");
        periods.push({ label, start: sDay, end: eDay, ts: sDay.getTime() });
      }
      return periods;
    }
    // yearly -> each month of the year
    const year = startDt.getFullYear();
    for (let m = 0; m < 12; m++) {
      const s = new Date(year, m, 1);
      const e = new Date(year, m + 1, 0);
      const label = s.toLocaleString("en-PH", { month: "short", year: "numeric" });
      periods.push({ label, start: toStartOfDay(s), end: toEndOfDay(e), ts: s.getTime() });
    }
    return periods;
  };

  const salesPeriods = generatePeriods(salesFilter, salesRange.start, salesRange.end);
  const orderPeriods = generatePeriods(orderFilter, orderRange.start, orderRange.end);

  const initSalesBucket = (label) => ({ date: label, total: 0, Online: 0, "On Store": 0 });
  const salesBuckets = Object.fromEntries(salesPeriods.map((p) => [p.label, { ...initSalesBucket(p.label), __ts: p.ts, start: p.start, end: p.end }]));

  const initOrderBucket = (label) => ({ date: label, Pending: 0, PaidToShip: 0, ToReceive: 0, Completed: 0, Cancelled: 0 });
  const orderBuckets = Object.fromEntries(orderPeriods.map((p) => [p.label, { ...initOrderBucket(p.label), __ts: p.ts, start: p.start, end: p.end }]));

  const findBucketKey = (buckets) => (dt) => {
    const t = new Date(dt).getTime();
    for (const key of Object.keys(buckets)) {
      const b = buckets[key];
      if (t >= b.start.getTime() && t <= b.end.getTime()) return key;
    }
    return null;
  };

  const salesFinder = findBucketKey(salesBuckets);
  completedSales.forEach((sale) => {
    const dt = new Date(sale.date || sale.created_at || new Date());
    const key = salesFinder(dt);
    if (!key) return;
    const amount = Number(sale.total) || 0;
    salesBuckets[key].total += amount;
    const who = sale.sold_by ? sale.sold_by.trim() : "Other";
    if (who === "Online" || who === "On Store") salesBuckets[key][who] += amount;
  });

  const orderFinder = findBucketKey(orderBuckets);
  allOrders.forEach((order) => {
    const dt = new Date(order.created_at);
    const key = orderFinder(dt);
    if (!key) return;
    if (order.status === "Pending") orderBuckets[key].Pending += 1;
    else if (order.status === "Paid" || order.status === "To Ship") orderBuckets[key].PaidToShip += 1;
    else if (order.status === "To Receive") orderBuckets[key].ToReceive += 1;
    else if (order.status === "Completed") orderBuckets[key].Completed += 1;
    else if (order.status === "Cancelled") orderBuckets[key].Cancelled += 1;
  });

  const groupedSales = Object.values(salesBuckets).sort((a, b) => a.__ts - b.__ts).map(({ __ts, start, end, ...rest }) => rest);
  const groupedOrders = Object.values(orderBuckets).sort((a, b) => a.__ts - b.__ts).map(({ __ts, start, end, ...rest }) => rest);

  setSalesData(groupedSales);
  setOrdersData(groupedOrders);

  setLoading(false);
};

// -------------------- FETCH ALL DATA --------------------
const fetchAllData = async () => {
  setLoading(true);
  await Promise.all([fetchAdminName(), fetchProducts(), fetchCustomers()]);
  await prepareChartData();
  setLoading(false);
};

useEffect(() => {
  fetchAllData();
}, []);

// Re-run charts when filters change
useEffect(() => {
  prepareChartData();
}, [salesFilter, orderFilter]);

  // -------------------- Logout --------------------
  const handleLogout = async () => {
  const result = await MySwal.fire({
    title: 'Are you sure?',
    text: "You will be logged out!",
    icon: 'warning',
    showCancelButton: true,
    confirmButtonColor: '#22c55e',
    cancelButtonColor: '#f43f5e',
    confirmButtonText: 'Yes, log out!',
  });

  if (!result.isConfirmed) return;

  try {
    await supabase.auth.signOut();
    window.location.href = "/";
  } catch (error) {
    console.error("Logout error:", error.message);
    MySwal.fire('Error', 'Failed to log out. Please try again.', 'error');
  }
};

  // -------------------- PRODUCT FUNCTIONS --------------------
  const addStock = async (id) => {
    const product = products.find(p => p.id === id);
    if (!product) return alert('Product not found');

    const stockInput = prompt(`Enter stock to add for ${product.name}:`);
    if (!stockInput) return;

    const addedUnits = parseInt(stockInput, 10);
    if (isNaN(addedUnits) || addedUnits <= 0) {
      return alert('Please enter a valid number of units');
    }

    const newStock = product.stock + addedUnits;

    try {
      const { error } = await supabase
        .from('products')
        .update({ stock: newStock })
        .eq('id', id);

      if (error) return alert('Failed to update stock');

      const message = `${addedUnits} new units of "${product.name}" are now available! Grab yours before it runs out!`;
      await sendProductNotification(message);

      fetchProducts();
      alert(`Stock updated! ${addedUnits} units added to "${product.name}".`);
    } catch (err) {
      console.error(err);
      alert('An unexpected error occurred while adding stock.');
    }
  };

  const openProductModal = (product = null) => {
    if (product) {
      setNewProduct({ ...product, imageFile: null });
    } else {
      setNewProduct({ id: null, name: '', description: '', price: '', stock: '', category: 'Hair Product', imageFile: null, image_url: '' });
    }
    setShowProductModal(true);
  };

  const deleteProduct = async (id) => {
    if (!window.confirm('Are you sure you want to delete this product?')) return;

    const { error } = await supabase.from('products').delete().eq('id', id);
    if (error) alert('Failed to delete product');
    else fetchProducts();
  };

  const handleFileChange = (e) => {
    if (e.target.files && e.target.files[0]) {
      setNewProduct({ ...newProduct, imageFile: e.target.files[0] });
    }
  };

  // -------------------- UPLOAD IMAGE TO BUCKET --------------------
  const uploadImage = async () => {
    try {
      if (!newProduct.imageFile) return newProduct.image_url;

      const ext = newProduct.imageFile.name.split('.').pop();
      const fileName = `${Date.now()}.${ext}`;
      const filePath = `uploads/${fileName}`;

      const blob = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(new Blob([reader.result], { type: newProduct.imageFile.type }));
        reader.onerror = reject;
        reader.readAsArrayBuffer(newProduct.imageFile);
      });

      const { error } = await supabase.storage.from('product-images').upload(filePath, blob, { upsert: true });
      if (error) throw error;

      const { data } = supabase.storage.from('product-images').getPublicUrl(filePath);
      return data.publicUrl;
    } catch (error) {
      console.error('Image upload error:', error.message);
      alert('Image upload failed');
      return null;
    }
  };

  // -------------------- ADD / EDIT PRODUCT --------------------
  const saveProduct = async () => {
    const { id, name, description, price, stock, category } = newProduct;
    if (!name || !price || !stock) return alert('Please fill all fields');

    const imageUrl = await uploadImage();
    if (!imageUrl) return;

    const payload = {
      name,
      description,
      price: parseFloat(price),
      stock: parseInt(stock, 10),
      category,
      image_url: imageUrl
    };

    try {
      let action = '';
      let notifMessage = '';

      if (id) {
        const { data: existing, error: fetchError } = await supabase
          .from('products')
          .select('*')
          .eq('id', id)
          .single();

        if (fetchError) return alert('Failed to fetch existing product');

        const changes = [];
        if (existing.name !== name) changes.push(`Name: "${existing.name}" → "${name}"`);
        if (existing.price !== parseFloat(price)) changes.push(`Price: ₱${existing.price} → ₱${price}`);
        if (existing.stock !== parseInt(stock, 10)) changes.push(`Stock: ${existing.stock} → ${stock}`);
        if (existing.description !== description) changes.push('Description updated');
        if (existing.category !== category) changes.push(`Category: ${existing.category} → ${category}`);

        const { error } = await supabase.from('products').update(payload).eq('id', id);
        if (error) return alert('Failed to update product');

        action = 'updated';
        notifMessage = changes.length > 0
          ? `✏️ Product "${name}" has been updated:\n• ${changes.join('\n• ')}`
          : `✏️ Product "${name}" has been updated.`;
      } else {
        const { error } = await supabase.from('products').insert([payload]);
        if (error) return alert('Failed to add product');

        action = 'added';
        notifMessage = `🛍️ New product alert! "${name}" is now available with ${stock} in stock. Check it out!`;
      }

      await sendProductNotification(notifMessage);

      alert(`Product successfully ${action}!`);
      fetchProducts();
      setShowProductModal(false);
      setNewProduct({ id: null, name: '', description: '', price: '', stock: '', category: 'Perfume', imageFile: null, image_url: '' });
    } catch (error) {
      console.error(error);
      alert('An unexpected error occurred.');
    }
  };

  // -------------------- SEND NOTIFICATION TO ALL USERS --------------------
  const sendProductNotification = async (message) => {
    if (!message || typeof message !== 'string') return;
    try {
      const { data: customers, error } = await supabase.from('customers').select('user_id');
      if (error) throw error;

      const notifications = customers.map(c => ({
        user_id: c.user_id,
        message: String(message),
        read: false
      }));

      if (notifications.length > 0) {
        const { error: notifError } = await supabase.from('notifications').insert(notifications);
        if (notifError) console.error('Failed to send notifications:', notifError.message);
      }
    } catch (err) {
      console.error('Notification error:', err.message);
    }
  };

  // -------------------- PDF DOWNLOAD: PRODUCTS (NO IMAGES) --------------------
  const downloadProductsPDF = () => {
    try {
      const doc = new jsPDF();
      doc.text("Products List", 14, 20);

      const tableColumn = ["Name", "Description", "Category", "Price", "Stock"];
      const tableRows = [];

      products.forEach((product) => {
        tableRows.push([
          product.name,
          product.description || "",
          product.category,
          `$${product.price}`,
          product.stock,
        ]);
      });

      autoTable(doc, {
        head: [tableColumn],
        body: tableRows,
        startY: 30,
        styles: { cellWidth: "wrap", fontSize: 10 },
        headStyles: { fillColor: [76, 175, 80], textColor: 255 },
      });

      doc.save("products.pdf");
    } catch (err) {
      console.error("PDF download error:", err);
      alert("Failed to download PDF. Check console for details.");
    }
  };

  // -------------------- PDF DOWNLOAD: CUSTOMERS --------------------
  const downloadCustomersPDF = () => {
    try {
      const doc = new jsPDF();
      doc.text("Customers List", 14, 20);

      const tableColumn = ["Username", "Full Name", "Email", "Status"];
      const tableRows = customers.map((c) => [
        c.username || "",
        c.full_name || "",
        c.email || "",
        c.status,
      ]);

      autoTable(doc, {
        head: [tableColumn],
        body: tableRows,
        startY: 30,
        styles: { cellWidth: "wrap", fontSize: 10 },
        headStyles: { fillColor: [76, 175, 80], textColor: 255 },
      });

      doc.save("customers.pdf");
    } catch (err) {
      console.error("Customers PDF download error:", err);
      alert("Failed to download customers PDF. Check console for details.");
    }
  };

// -------------------- TOGGLE CUSTOMER STATUS --------------------
const toggleCustomerStatus = async (id, currentStatus) => {
  const newStatus = currentStatus === "active" ? "blocked" : "active";

  const { error } = await supabase
    .from("customers")
    .update({ status: newStatus }) // 🔥 Only update the status
    .eq("id", id);

  if (error) {
    alert("Failed to update status");
  } else {
    fetchCustomers();
  }
};



  // -------------------- MESSAGE SYSTEM --------------------
  const [showInbox, setShowInbox] = useState(false);
  const [inboxUsers, setInboxUsers] = useState([]);
  const [chatMessages, setChatMessages] = useState({});
  const [newMessage, setNewMessage] = useState({});
  const [unreadCounts, setUnreadCounts] = useState({});
  const chatEndRefs = useRef({});
  const channelRef = useRef(null);
  const [openChats, setOpenChats] = useState([]);

  const totalUnread = Object.values(unreadCounts).reduce((a, b) => a + b, 0);

  // -------------------- FETCH INBOX --------------------
  const fetchInbox = async () => {
    if (!adminId) return; // wait until we have admin id
    try {
      const { data: messages, error } = await supabase
        .from("messages")
        .select("*")
        .or(`sender_id.eq.${adminId},receiver_id.eq.${adminId}`)
        .order("created_at", { ascending: false });

      if (error) throw error;

      const uniqueIds = new Set();
      const counts = {};

      messages.forEach((msg) => {
        const otherId =
          msg.sender_id === adminId ? msg.receiver_id : msg.sender_id;
        if (otherId) uniqueIds.add(otherId);

        if (msg.receiver_id === adminId && !msg.read) {
          counts[msg.sender_id] = (counts[msg.sender_id] || 0) + 1;
        }
      });

      setUnreadCounts(counts);

      if (uniqueIds.size > 0) {
        const { data: users } = await supabase
          .from("customers")
          .select("user_id, username, full_name")
          .in("user_id", Array.from(uniqueIds));

        const mappedUsers = Array.from(uniqueIds).map((id) => {
          const user = users?.find((u) => u.user_id === id);
          const lastMsg = messages.find(
            (m) => m.sender_id === id || m.receiver_id === id
          );
          return {
            id,
            name: user ? user.username || user.full_name : id.substring(0, 6),
            lastMessage: lastMsg?.message || "",
            lastTime: lastMsg?.created_at || null,
          };
        });

        setInboxUsers(mappedUsers);
      } else {
        setInboxUsers([]);
      }
    } catch (err) {
      console.error("Fetch inbox error:", err);
      setInboxUsers([]);
      setUnreadCounts({});
    }
  };

  // -------------------- FETCH CHAT --------------------
  const fetchChatMessages = async (customer) => {
    if (!adminId) return;
    try {
      const { data, error } = await supabase
        .from("messages")
        .select("*")
        .or(
          `and(sender_id.eq.${customer.id},receiver_id.eq.${adminId}),and(sender_id.eq.${adminId},receiver_id.eq.${customer.id})`
        )
        .order("created_at", { ascending: true });

      if (!error) {
        setChatMessages((prev) => ({ ...prev, [customer.id]: data || [] }));
      }

      await supabase
        .from("messages")
        .update({ read: true })
        .eq("sender_id", customer.id)
        .eq("receiver_id", adminId)
        .eq("read", false);

      setUnreadCounts((prev) => ({ ...prev, [customer.id]: 0 }));

      setTimeout(
        () =>
          chatEndRefs.current[customer.id]?.scrollIntoView({ behavior: "smooth" }),
        100
      );
    } catch (err) {
      console.error("Fetch chat error:", err);
    }
  };

  // -------------------- OPEN CHAT --------------------
  const openChat = async (customer) => {
    setOpenChats((prev) =>
      prev.find((c) => c.id === customer.id) ? prev : [...prev, customer]
    );
    await fetchChatMessages(customer);
    setShowInbox(false);
  };

  // -------------------- SEND MESSAGE --------------------
  const sendMessage = async (customerId) => {
    const msgText = newMessage[customerId]?.trim();
    if (!msgText) return;

    try {
      const payload = {
        sender_id: adminId,
        receiver_id: customerId,
        message: msgText,
        read: false,
      };

      const { error } = await supabase.from("messages").insert([payload]);
      if (!error)
        setNewMessage((prev) => ({ ...prev, [customerId]: "" }));
      else console.error("Send message error:", error);
    } catch (err) {
      console.error("Send message exception:", err);
    }
  };

  // -------------------- REAL-TIME UPDATES --------------------
  useEffect(() => {
    // don't subscribe or fetch chats until we know adminId
    if (!adminId) return;
    fetchInbox();
    fetchCustomers();

    const chatChannel = supabase
      .channel("messages_admin_dashboard")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages" },
        async ({ new: newMsg }) => {
          if (
            newMsg.sender_id !== adminId &&
            newMsg.receiver_id !== adminId
          )
            return;

          const otherId =
            newMsg.sender_id === adminId
              ? newMsg.receiver_id
              : newMsg.sender_id;

          setChatMessages((prev) => {
            const updated = [...(prev[otherId] || []), newMsg].sort(
              (a, b) => new Date(a.created_at) - new Date(b.created_at)
            );
            return { ...prev, [otherId]: updated };
          });

          setInboxUsers((prev) => {
            const exists = prev.find((u) => u.id === otherId);
            if (exists) {
              return prev.map((u) =>
                u.id === otherId
                  ? {
                      ...u,
                      lastMessage: newMsg.message,
                      lastTime: newMsg.created_at,
                    }
                  : u
              );
            } else {
              return [
                ...prev,
                {
                  id: otherId,
                  name: otherId.substring(0, 6),
                  lastMessage: newMsg.message,
                  lastTime: newMsg.created_at,
                },
              ];
            }
          });

          const { data: userData } = await supabase
            .from("customers")
            .select("user_id, username, full_name")
            .eq("user_id", otherId)
            .single();

          if (userData) {
            setInboxUsers((prev) =>
              prev.map((u) =>
                u.id === otherId
                  ? { ...u, name: userData.username || userData.full_name }
                  : u
              )
            );
          }

          if (
            newMsg.receiver_id === adminId &&
            !openChats.find((c) => c.id === otherId)
          ) {
            setUnreadCounts((prev) => ({
              ...prev,
              [otherId]: (prev[otherId] || 0) + 1,
            }));
          }

          setTimeout(
            () =>
              chatEndRefs.current[otherId]?.scrollIntoView({
                behavior: "smooth",
              }),
            100
          );
        }
      )
      .subscribe();

    const customerChannel = supabase
      .channel("customers_admin_dashboard")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "customers" },
        ({ new: newCustomer }) => {
          setCustomers((prev) => {
            if (prev.find((c) => c.user_id === newCustomer.user_id)) return prev;
            return [...prev, newCustomer];
          });
        }
      )
      .subscribe();

    channelRef.current = { chatChannel, customerChannel };

    return () => {
      if (channelRef.current?.chatChannel) supabase.removeChannel(channelRef.current.chatChannel);
      if (channelRef.current?.customerChannel) supabase.removeChannel(channelRef.current.customerChannel);
    };
  }, [openChats, adminId]);

  // -------------------- UI PART: INBOX --------------------
  const renderInboxDropdown = () => (
    <div className="absolute right-4 top-12 mt-5 bg-white border rounded shadow-lg w-80 max-h-96 overflow-auto z-50">
      <div className="p-4 font-bold text-center border-b bg-green-600 text-white">
        Messages
      </div>

      {inboxUsers.length > 0 ? (
        inboxUsers.map((c) => (
          <div
            key={c.id}
            className="p-2 border-b cursor-pointer hover:bg-gray-100 flex justify-between items-center"
            onClick={() => openChat(c)}
          >
            <div>
              <div className="font-bold">{c.name}</div>
              {unreadCounts[c.id] > 0 && (
                <div className="text-sm text-green-600 font-medium">
                  New message
                </div>
              )}
            </div>
            {unreadCounts[c.id] > 0 && (
              <div className="bg-red-500 text-white text-xs px-2 py-0.5 rounded-full">
                {unreadCounts[c.id]}
              </div>
            )}
          </div>
        ))
      ) : (
        <p className="text-center text-gray-500 py-4">No messages yet.</p>
      )}
    </div>
  );

  // -------------------- UI PART: CHAT --------------------
  const renderChatBoxes = () =>
    openChats.map((customer, index) => (
      <div
        key={customer.id}
        className="fixed bottom-0 right-0 bg-white border rounded-t-lg shadow-lg w-80 h-[400px] flex flex-col z-50"
        style={{ right: `${index * 380 + 20}px` }}
      >
        <div className="flex items-center justify-between px-4 py-2 bg-green-600 text-white rounded-t-lg relative">
          <span className="font-semibold">{customer.name}</span>
          <button
            className="absolute right-2 top-2 bg-white text-green-600 rounded-full w-6 h-6 flex items-center justify-center shadow-md hover:bg-gray-100 z-50"
            onClick={() =>
              setOpenChats((prev) => prev.filter((c) => c.id !== customer.id))
            }
          >
            ✖
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-3 bg-gray-50">
          {(chatMessages[customer.id] || [])
            .sort((a, b) => new Date(a.created_at) - new Date(b.created_at))
            .map((msg, idx) => {
              const isAdmin = msg.sender_id === adminId;
              return (
                <div
                  key={idx}
                  className={`flex mb-2 ${
                    isAdmin ? "justify-end" : "justify-start"
                  }`}
                >
                  <div
                    className={`px-4 py-2 rounded-2xl max-w-[70%] text-sm shadow ${
                      isAdmin
                        ? "bg-green-500 text-white rounded-br-none"
                        : "bg-gray-200 text-gray-800 rounded-bl-none"
                    }`}
                  >
                    {msg.message}
                    <div className="text-[10px] text-gray-500 mt-1 text-right">
                      {new Date(msg.created_at).toLocaleTimeString("en-PH", {
                        hour: "2-digit",
                        minute: "2-digit",
                        hour12: true,
                        timeZone: "Asia/Manila",
                      })}
                    </div>
                  </div>
                </div>
              );
            })}
          <div ref={(el) => (chatEndRefs.current[customer.id] = el)} />
        </div>

        <div className="flex items-center gap-2 p-2 border-t bg-white">
          <input
            className="flex-1 px-3 py-2 border rounded-full text-sm focus:outline-none focus:ring-2 focus:ring-green-400"
            placeholder="Aa"
            value={newMessage[customer.id] || ""}
            onChange={(e) =>
              setNewMessage((prev) => ({
                ...prev,
                [customer.id]: e.target.value,
              }))
            }
            onKeyDown={(e) => e.key === "Enter" && sendMessage(customer.id)}
          />
          <button
            className="px-3 py-2 bg-green-500 text-white rounded-full hover:bg-green-600"
            onClick={() => sendMessage(customer.id)}
          >
            ➤
          </button>
        </div>
      </div>
    ));

  // -------------------- RENDER CONTENT --------------------
  const renderContent = () => {
    switch (activeTab) {
      case 'Home':
  const lowStockProducts = products.filter(p => p.stock <= LOW_STOCK_THRESHOLD);
  return (
    <div className="p-6 relative">
      {/* --- Top Right Buttons --- */}
      <div className="absolute right-5 top-5 flex items-center gap-4">
  {/* Inbox / Messages */}
  <button
    className="text-white rounded-full hover:text-gray-300 relative"
    onClick={() => {
      const next = !showInbox;
      setShowInbox(next);
      setShowProfileMenu(false); // close profile when opening inbox
      if (next) fetchInbox();
    }}
  >
    💬
    {totalUnread > 0 && (
      <span className="absolute -top-1 -right-2 bg-red-500 text-white text-xs font-bold px-1.5 py-0.5 rounded-full">
        {totalUnread}
      </span>
    )}
  </button>

  {/* Profile Dropdown Trigger */}
  <div className="relative">
    <button
      className="text-block rounded-full hover:text-gray-300"
      onClick={() => {
        const next = !showProfileMenu;
        setShowProfileMenu(next);
        setShowInbox(false); // close inbox when opening profile
      }}
    >
      <User size={22} />
    </button>

    {/* Dropdown Menu */}
    {showProfileMenu && (
      <div className="absolute right-0 mt-2 w-40 bg-white rounded-lg shadow-lg py-2 animate-fadeIn z-50">
        <button
          className="w-full text-left px-4 py-2 text-gray-700 hover:bg-gray-100 flex items-center gap-2"
          onClick={() => setActiveTab("Profile")}
        >
          <User size={18} /> Profile
      </button>

        <button
          className="w-full text-left px-4 py-2 text-red-600 hover:bg-gray-100 flex items-center gap-2"
          onClick={handleLogout}
        >
          <LogOut size={18} /> Log Out
        </button>
      </div>
    )}
  </div>

  
</div>


      {showInbox && renderInboxDropdown()}
      {renderChatBoxes()}

{/* --- Summary Cards Section --- */}
<div className="grid grid-cols-1 md:grid-cols-3 gap-12 mt-12">

  {/* Number of Items */}
  <div
    className="bg-blue-300 p-4 rounded shadow relative flex items-center cursor-pointer hover:opacity-90"
    onClick={() => {
      setActiveTab("Products");
      setStockFilter("All");
      setMovingFilter("All");
    }}
  >
    <div className="text-left">
      <h3 className="font-bold text-lg text-blue-700">Number Of Items</h3>
      <p className="text-2xl font-semibold">{products.length}</p>
    </div>

    <img src={productIcon} alt="Items" className="w-10 h-10 absolute right-4" />
  </div>

  {/* All Users */}
  <div
    className="bg-yellow-300 p-4 rounded shadow relative flex items-center cursor-pointer hover:opacity-90"
    onClick={() => setActiveTab("Customers")}
  >
    <div className="text-left">
      <h3 className="font-bold text-lg text-yellow-700">All Users</h3>
      <p className="text-2xl font-semibold">{customers.length}</p>
    </div>

    <img src={customerIcon} alt="Users" className="w-10 h-10 absolute right-4" />
  </div>

  {/* Low Stock Products */}
  <div
    className="bg-red-300 p-4 rounded shadow relative flex items-center cursor-pointer hover:opacity-90"
    onClick={() => {
      setStockFilter("Low");
      setMovingFilter("All");
      setTimeout(() => {
        setActiveTab("Products");
      }, 50);
    }}
  >
    <div className="text-left">
      <h3 className="font-bold text-lg text-red-700">Low Stock Products</h3>
      <p className="text-2xl font-semibold">
        {products.filter(p => p.stock <= 100).length}
      </p>
    </div>

    <img
      src={lowStockIcon}
      alt="Low Stock"
      className="w-10 h-10 absolute right-4"
    />
  </div>

</div>




    {/* --- Graphs Section --- */}
<div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-10">
  {/* Sales Chart */}
  <div className="bg-white p-4 rounded shadow relative">
    <div className="flex justify-between items-center mb-4">
      <h3 className="text-lg font-bold text-green-700 text-center">
        Sales Over Time
      </h3>
      <select
        className="border rounded px-2 py-1 text-sm absolute top-4 right-4"
        value={salesFilter}
        onChange={(e) => setSalesFilter(e.target.value)}
      >
        <option value="weekly">Weekly</option>
        <option value="monthly">Monthly</option>
        <option value="yearly">Yearly</option>
      </select>
    </div>
    {loading ? (
      <p className="text-center text-gray-500">Loading sales data...</p>
    ) : salesData.length > 0 ? (
      <ResponsiveContainer width="100%" height={300}>
        <LineChart data={salesData}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="date" />
          <YAxis />
          <Tooltip
            formatter={(value, name) => [
              `₱${Number(value).toLocaleString("en-PH", { minimumFractionDigits: 2 })}`,
              name,
            ]}
          />
          <Legend />
          {Object.keys(salesData[0])
            .filter((key) => key !== "date")
            .map((key) => (
              <Line
                key={key}
                type="monotone"
                dataKey={key}
                stroke={key === "total" ? "#22c55e" : key === "Online" ? "#2563eb" : "#f97316"}
                strokeWidth={key === "total" ? 3 : 2}
                dot={{ r: 3 }}
                name={key === "total" ? "Total Sales" : key}
              />
            ))}
        </LineChart>
      </ResponsiveContainer>
    ) : (
      <p className="text-center text-gray-500">No completed sales found.</p>
    )}
  </div>

  {/* Orders Chart */}
  <div className="bg-white p-4 rounded shadow relative">
    <div className="flex justify-between items-center mb-4">
      <h3 className="text-lg font-bold text-green-700 text-center">
        Orders Over Time
      </h3>
      <select
        className="border rounded px-2 py-1 text-sm absolute top-4 right-4"
        value={orderFilter}
        onChange={(e) => setOrderFilter(e.target.value)}
      >
        <option value="weekly">Weekly</option>
        <option value="monthly">Monthly</option>
        <option value="yearly">Yearly</option>
      </select>
    </div>
    {loading ? (
      <p className="text-center text-gray-500">Loading order data...</p>
    ) : ordersData.length > 0 ? (
      <ResponsiveContainer width="100%" height={300}>
        <BarChart data={ordersData}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="date" />
          <YAxis />
          <Tooltip />
          <Legend />
          <Bar dataKey="Pending" fill="#f97316" name="Pending" stackId="a" />
          <Bar dataKey="PaidToShip" fill="#2563eb" name="Paid / To Ship" stackId="a" />
          <Bar dataKey="ToReceive" fill="#facc15" name="To Receive" stackId="a" />
          <Bar dataKey="Completed" fill="#16a34a" name="Completed" stackId="a" />
          <Bar dataKey="Cancelled" fill="#6b7280" name="Cancelled" stackId="a" />
        </BarChart>
      </ResponsiveContainer>
    ) : (
      <p className="text-center text-gray-500">No orders found for this filter.</p>
    )}
  </div>
</div>

    </div>
  );
case "Profile":
        return <Account />;

      case "Customers":
  return <AdminCustomerList 
          fetchCustomers={fetchCustomers}
          customers={customers}
          toggleCustomerStatus={toggleCustomerStatus}
          downloadCustomersPDF={downloadCustomersPDF}
        />;

       case 'Products':
  return (
    <AdminProducts
      products={products}
      fetchProducts={fetchProducts}
      sendProductNotification={sendProductNotification}
      stockFilter={stockFilter}          // ✅ pass down
      movingFilter={movingFilter}        // ✅ pass down
      setStockFilter={setStockFilter}    // ✅ allow updates
      setMovingFilter={setMovingFilter}  // ✅ allow updates
    />
  );

      case "Sell Products":
    return (
   
       <div className="p-6">
            <AdminSellProducts
             products={products}
            fetchProducts={fetchProducts}/>
          </div>
    );
      

      case "Orders":
        return (
          <div className="p-6">
            <AdminOrders />
          </div>
        );

      case 'Sales':
        return (
          <AdminSalesReport
            products={products}
            fetchProducts={fetchProducts}
            sendProductNotification={sendProductNotification}
          />
        );

      case "Discounts":
        return (
          <div className="p-6">
            <AdminDiscounts />
          </div>
        );
      case "Payment Settings":
        return (
          <div className="p-6">
            <AdminPaymentOptions />
          </div>
        );
      

      default:
        return <div className="p-6">Select a tab to view content</div>;
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen w-screen bg-gray-100">
        <div className="flex flex-col items-center">
          <div className="w-16 h-16 border-4 border-green-700 border-t-transparent rounded-full animate-spin mb-4"></div>
          <div className="text-green-700 text-lg font-bold">Loading Dashboard...</div>
        </div>
      </div>
    );
  }
  
  return (
    <div className="flex min-h-screen w-screen bg-gray-100">
      {/* Sidebar */}
      <aside className="w-64 bg-green-800 text-white flex flex-col">
        <div className="p-6 text-xl font-bold border-b border-green-700"> Hi ! , {adminName}</div>
        <nav className="flex-1 p-4 flex flex-col gap-4">
          {['Home', 'Customers','Products','Sell Products',  'Orders', 'Sales', 'Discounts', 'Payment Settings'].map(tab => (
            <button
              key={tab}
              onClick={() => {
                setActiveTab(tab);
                setShowInbox(false);
                setShowProfileMenu(false);
              }}
              className={`text-center px-4 py-2 rounded font-bold ${
                activeTab === tab
                  ? 'bg-green-700 text-white'
                  : 'bg-green-500 text-white hover:bg-green-700'
              }`}
            >
              {tab}
            </button>
          ))}
        </nav>
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-auto">{renderContent()}</main>
    </div>
  );
}
