// deno-lint-ignore-file
// pages/AdminOrders.jsx
import React, { useEffect, useState, useCallback } from "react";
import { supabase } from "../lib/supabaseClient.js";
import { Clock, Truck, PackageCheck, XCircle } from "lucide-react";
import Swal from "sweetalert2";
import withReactContent from "sweetalert2-react-content";

const MySwal = withReactContent(Swal);

const ORDER_TABS = [
  { name: "Pending", icon: Clock },
  { name: "To Ship", icon: Truck },
  { name: "To Receive", icon: PackageCheck },
  { name: "Completed", icon: PackageCheck },
  { name: "Cancelled", icon: XCircle },
];

const STATUS_COLORS = {
  Pending: "bg-yellow-100 text-yellow-800",
  "To Ship": "bg-blue-100 text-blue-800",
  "To Receive": "bg-purple-100 text-purple-800",
  Completed: "bg-green-100 text-green-800",
  Cancelled: "bg-gray-200 text-gray-600",
};

export default function AdminOrders() {
  const [activeTab, setActiveTab] = useState("Pending");
  const [searchTerm, setSearchTerm] = useState("");
  const [orders, setOrders] = useState([]);
  const [filteredOrders, setFilteredOrders] = useState([]);
  const [loading, setLoading] = useState(false);

  const [tabCounts, setTabCounts] = useState({});
  const [seenCompletedIds, setSeenCompletedIds] = useState(new Set());
  const [seenCancelledIds, setSeenCancelledIds] = useState(new Set());
  const [unreadCounts, setUnreadCounts] = useState({ Completed: 0, Cancelled: 0 });
  const [initialSeenReset, setInitialSeenReset] = useState(true);

  const [updatingId, setUpdatingId] = useState(null);

  const [showTrackingModal, setShowTrackingModal] = useState(false);
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [showDetailsModal, setShowDetailsModal] = useState(false);

  const [selectedOrderId, setSelectedOrderId] = useState(null);
  const [trackingNumber, setTrackingNumber] = useState("");
  const [cancelReason, setCancelReason] = useState("");
  const [customReason, setCustomReason] = useState("");
  const [selectedOrder, setSelectedOrder] = useState(null);

  // ---------- Helpers ----------
  const orderTabName = (order) => {
    if (!order) return null;
    if (order.status === "Paid" || order.status === "To Ship") return "To Ship";
    return order.status;
  };

  const sendCustomerNotification = async (userId, message, orderId = null) => {
    if (!userId) return console.error("Cannot send notification: no user_id");
    try {
      await supabase.from("notifications").insert({
        user_id: userId,
        message,
        order_id: orderId,
        read: false
      });
      console.log("Notification sent:", { userId, message, orderId });
    } catch (err) {
      console.error("Failed to send notification:", err);
    }
  };

  // ---------- Fetching & merge ----------
  const fetchOrders = useCallback(async () => {
    setLoading(true);
    try {
      const { data: ordersData, error: ordersError } = await supabase
        .from("orders")
        .select("*")
        .order("created_at", { ascending: false });
      if (ordersError) throw ordersError;

      const { data: customersData, error: customersError } = await supabase
        .from("customers")
        .select("user_id, username, email");
      if (customersError) throw customersError;

      const { data: productsData, error: productsError } = await supabase
        .from("products")
        .select("id, name, image_url");
      if (productsError) throw productsError;

      const mergedOrders = (ordersData || []).map((order) => {
        const customer = customersData.find((c) => c.user_id === order.user_id);
        const updatedItems = Array.isArray(order.items)
          ? order.items.map((item) => {
              const productId = item.product_id || item.id || item.productId;
              const product = productsData.find((p) => p.id === productId);
              return {
                ...item,
                image_url: product?.image_url || "https://via.placeholder.com/80?text=No+Image",
                name: product?.name || item.name || "Unnamed Product",
              };
            })
          : [];

        return {
          ...order,
          customer_name: customer?.username || "Guest",
          customer_email: customer?.email || "",
          items: updatedItems,
          seen_Completed: order.seen_Completed || false,
          seen_Cancelled: order.seen_Cancelled || false,
        };
      });

      setOrders(mergedOrders);
    } catch (err) {
      console.error("Error fetching orders:", err);
      MySwal.fire("Error", "Failed to fetch orders.", "error");
    } finally {
      setLoading(false);
    }
  }, []);

  // ---------- Compute counts / filtered ----------
  const computeTabCounts = useCallback(() => {
    const counts = {};
    ORDER_TABS.forEach(({ name }) => {
      if (name === "To Ship") {
        counts[name] = orders.filter(
          (o) => o.status === "Paid" || o.status === "To Ship"
        ).length;
      } else {
        counts[name] = orders.filter((o) => o.status === name).length;
      }
    });
    setTabCounts(counts);
  }, [orders]);

  const computeUnreadCounts = useCallback(() => {
    const completedUnread = orders.filter(
      (o) => o.status === "Completed" && !seenCompletedIds.has(o.id)
    ).length;
    const cancelledUnread = orders.filter(
      (o) => o.status === "Cancelled" && !seenCancelledIds.has(o.id)
    ).length;
    setUnreadCounts({ Completed: completedUnread, Cancelled: cancelledUnread });
  }, [orders, seenCompletedIds, seenCancelledIds]);

  const applyFilters = useCallback(() => {
    const lower = (searchTerm || "").toLowerCase();
    const filtered = orders.filter((o) => {
      const matchesSearch =
        !searchTerm ||
        (o.id && String(o.id).toLowerCase().includes(lower)) ||
        (o.customer_name && o.customer_name.toLowerCase().includes(lower)) ||
        (o.customer_email && o.customer_email.toLowerCase().includes(lower));

      const matchesTab =
        activeTab === "To Ship"
          ? o.status === "Paid" || o.status === "To Ship"
          : activeTab !== "All"
          ? o.status === activeTab
          : true;

      return matchesSearch && matchesTab;
    });
    setFilteredOrders(filtered);
  }, [orders, activeTab, searchTerm]);

  // ---------- Effects ----------
  useEffect(() => {
    fetchOrders();
  }, [fetchOrders, activeTab]);

  useEffect(() => {
    applyFilters();
    computeTabCounts();
    computeUnreadCounts();
  }, [orders, searchTerm, applyFilters, computeTabCounts, computeUnreadCounts]);

  useEffect(() => {
    if (!initialSeenReset && orders.length === 0) return;
    if (!initialSeenReset) return;
    if (orders.length === 0) return;

    setSeenCompletedIds((prev) => {
      const next = new Set(prev);
      orders.forEach((o) => {
        if (o.status === "Completed") next.add(o.id);
      });
      return next;
    });

    setSeenCancelledIds((prev) => {
      const next = new Set(prev);
      orders.forEach((o) => {
        if (o.status === "Cancelled") next.add(o.id);
      });
      return next;
    });

    setUnreadCounts({ Completed: 0, Cancelled: 0 });
    setInitialSeenReset(false);
  }, [orders, initialSeenReset]);

  // ---------- Realtime subscription ----------
  useEffect(() => {
    let subscription = null;

    const subscribeRealtime = async () => {
      try {
        if (supabase.channel) {
          subscription = supabase
            .channel("orders-realtime")
            .on(
              "postgres_changes",
              { event: "*", schema: "public", table: "orders" },
              (payload) => {
                const newRow = payload?.new;
                if (newRow) {
                  const id = newRow.id;

                  // ✅ Only increment unread, do not reset
                  if (newRow.status === "Completed" && !seenCompletedIds.has(id) && activeTab !== "Completed") {
                    setUnreadCounts((prev) => ({ ...prev, Completed: prev.Completed + 1 }));
                  }

                  if (newRow.status === "Cancelled" && !seenCancelledIds.has(id) && activeTab !== "Cancelled") {
                    setUnreadCounts((prev) => ({ ...prev, Cancelled: prev.Cancelled + 1 }));
                  }

                  fetchOrders();
                } else {
                  fetchOrders();
                }
              }
            )
            .subscribe();
          return;
        }

        if (supabase.from) {
          subscription = supabase
            .from("orders")
            .on("*", (payload) => {
              fetchOrders();
            })
            .subscribe();
          return;
        }
      } catch (err) {
        console.error("Error setting up realtime subscription:", err);
      }
    };

    subscribeRealtime();

    return () => {
      try {
        if (!subscription) return;
        if (supabase.removeChannel && subscription?.topic) {
          supabase.removeChannel(subscription);
          return;
        }
        if (typeof subscription.unsubscribe === "function") {
          subscription.unsubscribe();
          return;
        }
        if (supabase.removeSubscription) {
          supabase.removeSubscription(subscription);
        }
      } catch (err) {
        console.error("Error unsubscribing realtime:", err);
      }
    };
  }, [fetchOrders, activeTab, seenCompletedIds, seenCancelledIds]);

  // ---------- Tab click behavior ----------
  const handleTabClick = (name) => {
    setActiveTab(name);

    if (name === "Completed") {
      setSeenCompletedIds((prev) => {
        const next = new Set(prev);
        orders.forEach((o) => {
          if (o.status === "Completed") next.add(o.id);
        });
        return next;
      });
      setUnreadCounts((prev) => ({ ...prev, Completed: 0 }));
    }

    if (name === "Cancelled") {
      setSeenCancelledIds((prev) => {
        const next = new Set(prev);
        orders.forEach((o) => {
          if (o.status === "Cancelled") next.add(o.id);
        });
        return next;
      });
      setUnreadCounts((prev) => ({ ...prev, Cancelled: 0 }));
    }
  };

  // ---------- Action handlers ----------
  const handleStatusChange = async (orderId, newStatus) => {
    try {
      setUpdatingId(orderId);
      const { data: orderData, error: orderError } = await supabase
        .from("orders")
        .select("id, items, status, user_id, tracking_number")
        .eq("id", orderId)
        .single();
      if (orderError) throw orderError;

      if (orderData.status === "Pending" && newStatus === "To Ship") {
        const items = Array.isArray(orderData.items) ? orderData.items : [];
        for (const item of items) {
          const productId = item.product_id || item.id || item.productId;
          const quantity = item.quantity || 0;
          const { data: product, error: productError } = await supabase
            .from("products")
            .select("stock")
            .eq("id", productId)
            .single();
          if (productError) throw productError;
          const newStock = Math.max((product.stock || 0) - quantity, 0);
          const { error: updateStockError } = await supabase
            .from("products")
            .update({ stock: newStock })
            .eq("id", productId);
          if (updateStockError) throw updateStockError;
        }
      }

      const { error: statusError } = await supabase
        .from("orders")
        .update({ status: newStatus })
        .eq("id", orderId);
      if (statusError) throw statusError;

      switch (newStatus) {
        case "To Ship":
          await sendCustomerNotification(orderData.user_id, `📦 Your order #${orderId} is now preparing for shipment`, orderId);
          break;
        case "To Receive":
          await sendCustomerNotification(orderData.user_id, `🚚 Your order #${orderId} has been shipped. Tracking #: ${orderData.tracking_number || "N/A"}`, orderId);
          break;
        case "Completed":
          await sendCustomerNotification(orderData.user_id, `📦 Your order #${orderId} is now Completed`, orderId);
          break;
        case "Cancelled":
          await sendCustomerNotification(orderData.user_id, `❌ Your order #${orderId} has been cancelled.`, orderId);
          break;
        default:
          await sendCustomerNotification(orderData.user_id, `Your order #${orderId} has an update: ${newStatus}`, orderId);
      }

      // ✅ Keep badge until tab clicked
      if (newStatus === "Completed" && !seenCompletedIds.has(orderId)) {
        setUnreadCounts((prev) => ({ ...prev, Completed: prev.Completed + 1 }));
      } else if (newStatus === "Cancelled" && !seenCancelledIds.has(orderId)) {
        setUnreadCounts((prev) => ({ ...prev, Cancelled: prev.Cancelled + 1 }));
      }

      await fetchOrders();
      MySwal.fire("Success", `Order status updated to ${newStatus}`, "success");
    } catch (err) {
      console.error("Error updating status:", err);
      MySwal.fire("Error", "Failed to update order status.", "error");
    } finally {
      setUpdatingId(null);
    }
  };

  const handleCancelOrder = async () => {
    if (!cancelReason && !customReason) {
      MySwal.fire("Warning", "Please select or provide a reason for cancellation.", "warning");
      return;
    }
    const finalReason = cancelReason === "Other" ? customReason : cancelReason;

    try {
      setUpdatingId(selectedOrderId);
      const { data: orderData, error } = await supabase
        .from("orders")
        .select("user_id")
        .eq("id", selectedOrderId)
        .single();
      if (error) throw error;

      const { error: updateError } = await supabase
        .from("orders")
        .update({ status: "Cancelled", cancel_reason: finalReason })
        .eq("id", selectedOrderId);
      if (updateError) throw updateError;

      await sendCustomerNotification(
        orderData.user_id,
        `Your order #${selectedOrderId} has been cancelled. Reason: ${finalReason}`,
        selectedOrderId
      );

      if (!seenCancelledIds.has(selectedOrderId)) {
        setUnreadCounts((prev) => ({ ...prev, Cancelled: prev.Cancelled + 1 }));
      }

      MySwal.fire("Cancelled", "Order cancelled successfully!", "success");
      setShowCancelModal(false);
      setCancelReason("");
      setCustomReason("");
      await fetchOrders();
    } catch (err) {
      console.error("Error cancelling order:", err);
      MySwal.fire("Error", "Failed to cancel order.", "error");
    } finally {
      setUpdatingId(null);
    }
  };

  const handleAddTracking = async () => {
    if (!trackingNumber.trim()) {
      MySwal.fire("Warning", "Please enter a tracking number.", "warning");
      return;
    }
    try {
      setUpdatingId(selectedOrderId);
      const { data: orderData, error } = await supabase
        .from("orders")
        .select("user_id")
        .eq("id", selectedOrderId)
        .single();
      if (error) throw error;

      const { error: updateError } = await supabase
        .from("orders")
        .update({ tracking_number: trackingNumber })
        .eq("id", selectedOrderId);
      if (updateError) throw updateError;

      await sendCustomerNotification(
        orderData.user_id,
        `Tracking number for your order #${selectedOrderId} has been added: ${trackingNumber}`,
        selectedOrderId
      );

      MySwal.fire("Success", "Tracking number added successfully!", "success");
      setShowTrackingModal(false);
      setTrackingNumber("");
      setSelectedOrderId(null);
      await fetchOrders();
    } catch (err) {
      console.error("Error adding tracking number:", err);
      MySwal.fire("Error", "Failed to add tracking number.", "error");
    } finally {
      setUpdatingId(null);
    }
  };



  // ---------- Render ----------

  return (
    <div className="w-full h-full flex flex-col bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b px-6 py-5 shadow-sm flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">🛒 Orders</h1>
          <p className="text-sm text-gray-500">Manage and track all customer orders</p>
        </div>

        {/* search input */}
        <div className="mt-3 sm:mt-0">
          <input
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search by order id, buyer or email..."
            className="border px-6 py-2 rounded w-full max-w-sm"
          />
        </div>
      </div>

      {/* Tabs */}
      <div className="bg-white border-b px-6 py-3 flex gap-6 overflow-x-auto justify-center">
        {ORDER_TABS.map(({ name, icon: Icon }) => (
          <div key={name} className="relative inline-block">
            <button
              className={`px-3 py-2 rounded-lg font-medium flex items-center gap-2 transition-colors ${
                activeTab === name ? "bg-green-600 text-white shadow" : "bg-gray-100 text-gray-700 hover:bg-gray-200"
              }`}
              onClick={() => handleTabClick(name)}
            >
              <Icon size={18} />
              {name}
            </button>

            {/* Badge: Completed/Cancelled use unreadCounts (reset on view), others use tabCounts (total counts) */}
            {(name === "Completed" || name === "Cancelled") ? (
              unreadCounts[name] > 0 && (
                <span className="absolute -top-1 -right-2 bg-red-500 text-white text-xs font-bold w-5 h-5 flex items-center justify-center rounded-full">
                  {unreadCounts[name]}
                </span>
              )
            ) : (
              tabCounts[name] > 0 && (
                <span className="absolute -top-1 -right-2 bg-red-500 text-white text-xs font-bold w-5 h-5 flex items-center justify-center rounded-full">
                  {tabCounts[name]}
                </span>
              )
            )}
          </div>
        ))}
      </div>

      {/* Orders list */}
      <main className="flex-1 overflow-y-auto p-6">
        {loading ? (
          <p>Loading...</p>
        ) : filteredOrders.length === 0 ? (
          <p className="text-gray-500 text-center mt-10">No orders found in {activeTab}.</p>
        ) : (
          <div className="space-y-6">
            {filteredOrders.map((order) => (
              <div key={order.id} className="bg-white rounded-lg shadow border p-5 transition hover:shadow-md">
                <div className="flex justify-between items-center mb-4 flex-wrap gap-2">
                  <div>
                    <h2 className="font-semibold text-lg">Order #{String(order.id).slice(0, 8).toUpperCase()}</h2>
                    <p className="text-sm text-gray-500">Placed on {new Date(order.created_at).toLocaleString()}</p>
                    <p className="text-sm text-gray-700">
                      Buyer: {order.customer_name}{" "}
                      {order.customer_email && <span className="text-gray-500">({order.customer_email})</span>}
                    </p>

                    {order.status === "Cancelled" && order.cancel_reason && (
                      <p className="text-sm text-red-600 mt-1">
                        <span className="font-semibold">Cancel Reason:</span> {order.cancel_reason}
                      </p>
                    )}

                    {order.tracking_number && (
                      <p className="text-sm mt-1">
                        <span className="font-semibold text-gray-700">Tracking Number:</span> {order.tracking_number}
                      </p>
                    )}
                  </div>

                  <button
                    onClick={() => {
                      setSelectedOrder(order);
                      setShowDetailsModal(true);
                    }}
                    className="text-sm text-green-600 hover:underline font-medium ml-auto"
                  >
                    View Details
                  </button>
                </div>

                {/* Items */}
                <div className="divide-y">
                  {Array.isArray(order.items) &&
                    order.items.map((item, idx) => (
                      <div key={idx} className="flex items-center justify-between py-3">
                        <div className="flex items-center">
                          <img
                            src={item.image_url}
                            alt={item.name}
                            onError={(e) => {
                              e.target.src = "https://via.placeholder.com/80?text=No+Image";
                            }}
                            className="w-14 h-14 rounded-md mr-3 border object-cover"
                          />
                          <div>
                            <p className="font-medium">{item.name}</p>
                            <p className="text-sm text-gray-500">Qty: {item.quantity}</p>
                          </div>
                        </div>
                        <p className="font-semibold text-gray-700">₱{Number(item.price * item.quantity).toLocaleString()}</p>
                      </div>
                    ))}
                </div>

                {/* Actions */}
                <div className="flex justify-between items-center mt-4 flex-wrap gap-2">
                  <div className="font-bold text-lg">Total: ₱{order.total || 0}</div>

                  <div className="flex gap-2 flex-wrap">
                    {/* Pending actions */}
                    {order.status === "Pending" && (
                      <>
                        <button
                          disabled={updatingId === order.id}
                          onClick={() => handleStatusChange(order.id, "To Ship")}
                          className="bg-green-600 text-white px-3 py-1 rounded-md hover:bg-green-700 disabled:opacity-50"
                        >
                          {updatingId === order.id ? "Updating..." : "Mark as To Ship"}
                        </button>
                        <button
                          disabled={updatingId === order.id}
                          onClick={() => {
                            setSelectedOrderId(order.id);
                            setShowCancelModal(true);
                          }}
                          className="bg-red-500 text-white px-3 py-1 rounded-md hover:bg-red-600 disabled:opacity-50"
                        >
                          {updatingId === order.id ? "Updating..." : "Cancel Order"}
                        </button>
                      </>
                    )}

                    {/* To Ship actions */}
                    {(order.status === "To Ship" || order.status === "Paid") && (
                      <>
                        {!order.tracking_number && (
                          <button
                            onClick={() => {
                              setSelectedOrderId(order.id);
                              setShowTrackingModal(true);
                            }}
                            className="bg-green-600 text-white px-3 py-1 rounded-md hover:bg-green-700"
                          >
                            Add Tracking Number
                          </button>
                        )}

                        <button
                          disabled={!order.tracking_number || updatingId === order.id}
                          onClick={() => {
                            if (!order.tracking_number) {
                              alert("Please add a tracking number before marking as To Receive.");
                              return;
                            }
                            handleStatusChange(order.id, "To Receive");
                          }}
                          className={`px-3 py-1 rounded-md text-white ${order.tracking_number ? "bg-blue-600 hover:bg-blue-700" : "bg-gray-400 cursor-not-allowed"}`}
                        >
                          {updatingId === order.id ? "Updating..." : "Mark as To Receive"}
                        </button>

                        <button
                          disabled={updatingId === order.id}
                          onClick={() => {
                            setSelectedOrderId(order.id);
                            setShowCancelModal(true);
                          }}
                          className="bg-red-500 text-white px-3 py-1 rounded-md hover:bg-red-600 disabled:opacity-50"
                        >
                          {updatingId === order.id ? "Updating..." : "Cancel Order"}
                        </button>
                      </>
                    )}

                    {/* To Receive actions */}
                    {order.status === "To Receive" && (
                      <button
                        disabled={updatingId === order.id}
                        onClick={() => handleStatusChange(order.id, "Completed")}
                        className="px-3 py-1 rounded-md bg-green-600 text-white hover:bg-green-700"
                      >
                        {updatingId === order.id ? "Updating..." : "Mark as Received"}
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>

      {/* Cancel Modal */}
      {showCancelModal && (
        <div className="fixed inset-0 flex items-center justify-center bg-black bg-opacity-50 z-50">
          <div className="bg-white rounded-lg p-6 w-96 shadow-lg">
            <h2 className="text-lg font-semibold mb-4">Cancel Order — Select a Reason</h2>

            <div className="space-y-2 mb-4">
              {["Out of stock", "Invalid payment", "Customer request", "Other"].map((option) => (
                <label key={option} className="flex items-center gap-2">
                  <input type="radio" name="cancelReason" value={option} checked={cancelReason === option} onChange={(e) => setCancelReason(e.target.value)} />
                  <span>{option}</span>
                </label>
              ))}

              {cancelReason === "Other" && (
                <input type="text" placeholder="Enter custom reason..." className="w-full border rounded px-2 py-1 mt-2" value={customReason} onChange={(e) => setCustomReason(e.target.value)} />
              )}
            </div>

            <div className="flex justify-end gap-3">
              <button onClick={() => setShowCancelModal(false)} className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700">Close</button>
              <button onClick={handleCancelOrder} className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700">Confirm Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* Tracking Modal */}
      {showTrackingModal && (
        <div className="fixed inset-0 flex items-center justify-center bg-black bg-opacity-40 z-50">
          <div className="bg-white rounded-lg shadow-lg p-6 w-96">
            <h2 className="text-xl font-semibold mb-4">Add Tracking Number</h2>
            <input type="text" value={trackingNumber} onChange={(e) => setTrackingNumber(e.target.value)} placeholder="Enter Tracking Number (e.g. JNT123456789)" className="w-full border border-gray-300 rounded px-3 py-2 mb-4 focus:outline-none focus:ring-2 focus:ring-green-500" />
            <div className="flex justify-end gap-3">
              <button onClick={() => { setShowTrackingModal(false); setTrackingNumber(""); setSelectedOrderId(null); }} className="px-4 py-2 rounded bg-gray-300 hover:bg-gray-400">Cancel</button>
              <button onClick={handleAddTracking} className="px-4 py-2 rounded bg-green-600 text-white hover:bg-green-700">Save</button>
            </div>
          </div>
        </div>
      )}

      {/* View Details Modal */}
      {showDetailsModal && selectedOrder && (
        <div className="fixed inset-0 bg-black bg-opacity-40 flex justify-center items-center z-50">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto p-6">
            <h2 className="text-2xl font-bold text-green-700 mb-4">Order Details</h2>

            {/* Order Summary */}
            <div className="border border-gray-200 rounded-lg p-4 mb-4 bg-gray-50">
              <div className="flex justify-between items-center">
                <div>
                  <p className="text-sm text-gray-500">{new Date(selectedOrder.created_at).toLocaleString()}</p>
                  <p className="text-lg font-semibold text-gray-800">
                    Status:{" "}
                    <span className={`${selectedOrder.status === "Pending" ? "text-yellow-600" : selectedOrder.status === "To Ship" ? "text-blue-600" : selectedOrder.status === "Cancelled" ? "text-red-600" : "text-green-600"}`}>
                      {selectedOrder.status}
                    </span>
                  </p>
                </div>
                <div>
                  <p className="text-xl font-bold text-red-600">₱{Number(selectedOrder.total || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</p>
                </div>
              </div>
            </div>

            {/* Shipping Address */}
            <div className="border border-gray-200 rounded-lg p-4 mb-4">
              <h3 className="text-lg font-semibold text-green-700 mb-2">Shipping Address</h3>
              {selectedOrder.address ? (
                <div className="space-y-3 text-sm text-gray-700">
                  <div>
                    <span className="font-medium">Name:</span>
                    <div className="flex items-center gap-2 ml-2">
                      <span>{selectedOrder.address.Recipient_name}</span>
                      <button onClick={() => navigator.clipboard.writeText(selectedOrder.address.Recipient_name)} className="text-green-600 hover:text-green-800 text-xs font-medium">Copy</button>
                    </div>
                  </div>

                  {selectedOrder.address.phone && (
                    <div>
                      <span className="font-medium">Phone:</span>
                      <div className="flex items-center gap-2 ml-2">
                        <span>{selectedOrder.address.phone}</span>
                        <button onClick={() => navigator.clipboard.writeText(selectedOrder.address.phone)} className="text-green-600 hover:text-green-800 text-xs font-medium">Copy</button>
                      </div>
                    </div>
                  )}

                  <div>
                    <span className="font-medium">Address:</span>
                    <div className="flex flex-col items-start ml-2">
                      <span className="whitespace-pre-line leading-relaxed">
                        {[
                          selectedOrder.address.street,
                          selectedOrder.address.city && `${selectedOrder.address.city}${selectedOrder.address.province ? ", " + selectedOrder.address.province : ""}`,
                          selectedOrder.address.postal_code,
                        ].filter(Boolean).join("\n")}
                      </span>
                      <button onClick={() => navigator.clipboard.writeText([
                        selectedOrder.address.street,
                        selectedOrder.address.city && `${selectedOrder.address.city}${selectedOrder.address.province ? ", " + selectedOrder.address.province : ""}`,
                        selectedOrder.address.postal_code,
                      ].filter(Boolean).join(", "))} className="text-green-600 hover:text-green-800 text-xs font-medium mt-1">Copy</button>
                    </div>
                  </div>
                </div>
              ) : (
                <p className="text-gray-500 text-sm">No address provided</p>
              )}
            </div>

            {/* Ordered Items */}
            <div className="border border-gray-200 rounded-lg p-4 mb-4">
              <h3 className="text-lg font-semibold text-green-700 mb-3">Ordered Items ({selectedOrder.items?.length || 0})</h3>
              <div className="space-y-3">
                {selectedOrder.items?.map((item, index) => (
                  <div key={index} className="flex items-center justify-between border-b pb-2 last:border-b-0">
                    <div className="flex items-center space-x-3">
                      <img src={item.image_url} alt={item.name} className="w-14 h-14 rounded-lg object-cover" />
                      <div>
                        <p className="font-medium text-gray-800 text-sm">{item.name}</p>
                        <p className="text-xs text-gray-500">₱{Number(item.price).toLocaleString()} × {item.quantity}</p>
                      </div>
                    </div>
                    <p className="font-semibold text-red-600 text-sm">₱{Number(item.price * item.quantity).toLocaleString(undefined, { minimumFractionDigits: 2 })}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Payment Details */}
            <div className="border border-gray-200 rounded-lg p-4 mb-4">
              <h3 className="text-lg font-semibold text-green-700 mb-2">Payment Details</h3>
              <div className="text-sm space-y-1">
                <p><span className="font-medium">Payment Method:</span> {selectedOrder.payment_method || "—"}</p>
                <p><span className="font-medium">Subtotal:</span> ₱{Number(selectedOrder.subtotal || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</p>
                <p><span className="font-medium">Shipping Fee:</span> ₱{Number(selectedOrder.shipping_fee || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</p>
                {selectedOrder.discount > 0 && (<p className="text-red-600"><span className="font-medium">Discount:</span> -₱{Number(selectedOrder.discount).toLocaleString(undefined, { minimumFractionDigits: 2 })}</p>)}
                <p className="font-semibold"><span>Total:</span> ₱{Number(selectedOrder.total).toLocaleString(undefined, { minimumFractionDigits: 2 })}</p>
              </div>
            </div>

            {/* Tracking & Metadata */}
            <div className="border border-gray-200 rounded-lg p-4 mb-4">
              <h3 className="text-lg font-semibold text-green-700 mb-2">Order Information</h3>
              <div className="text-sm text-gray-700 space-y-1">
                <p>Order ID: {selectedOrder.id}</p>
                {selectedOrder.tracking_number && <p>Tracking #: {selectedOrder.tracking_number}</p>}
                {selectedOrder.cancel_reason && <p className="text-red-600">Cancel Reason: {selectedOrder.cancel_reason}</p>}
              </div>
            </div>

            <div className="flex justify-end">
              <button onClick={() => { setShowDetailsModal(false); setSelectedOrder(null); }} className="px-5 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition">Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
