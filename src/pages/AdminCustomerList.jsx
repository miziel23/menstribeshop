// deno-lint-ignore-file
import React, { useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient.js";
import Swal from "sweetalert2";
import withReactContent from "sweetalert2-react-content";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

const MySwal = withReactContent(Swal);

export default function AdminCustomerList() {
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(true);

  const [ordersModalVisible, setOrdersModalVisible] = useState(false);
  const [selectedCustomerOrders, setSelectedCustomerOrders] = useState([]);
  const [selectedCustomerName, setSelectedCustomerName] = useState("");

  // -------------------- FETCH CUSTOMERS + DEFAULT ADDRESSES --------------------
  const fetchCustomers = async () => {
    setLoading(true);
    try {
      const { data: customerData, error: customerError } = await supabase
        .from("customers")
        .select("*")
        .order("id", { ascending: true });
      if (customerError) throw customerError;

      const { data: addressData, error: addressError } = await supabase
        .from("addresses")
        .select("*")
        .eq("is_default", true);

      if (addressError) throw addressError;

      const merged = customerData.map((cust) => {
        const defaultAddress = addressData.find(
          (addr) => String(addr.user_id) === String(cust.user_id)
        );

        return {
          ...cust,
          phone: defaultAddress?.phone || "No Phone Number",
          address: defaultAddress
            ? `${defaultAddress.street}, ${defaultAddress.city}, ${defaultAddress.province}, ${defaultAddress.postal_code}`
            : "No Address",
        };
      });

      setCustomers(merged);
    } catch (err) {
      console.error("Error fetching customers and addresses:", err);
      setCustomers([]);
      MySwal.fire({
        icon: "error",
        title: "Error",
        text: "Failed to fetch customers",
      });
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchCustomers();
  }, []);

  // -------------------- TOGGLE CUSTOMER STATUS --------------------
  const toggleCustomerStatus = async (id, currentStatus) => {
    const newStatus = currentStatus === "active" ? "blocked" : "active";
    const { error } = await supabase
      .from("customers")
      .update({ status: newStatus })
      .eq("id", id);
    if (error)
      MySwal.fire({
        icon: "error",
        title: "Error",
        text: "Failed to update status",
      });
    else fetchCustomers();
  };

  // -------------------- FETCH CUSTOMER ORDERS --------------------
  const fetchCustomerOrders = async (customer) => {
    try {
      const { data, error } = await supabase
        .from("orders")
        .select("id, items")
        .eq("user_id", customer.user_id)
        .order("created_at", { ascending: false });

      if (error) throw error;

      const allItems = [];
      data.forEach((order) => {
        if (order.items && Array.isArray(order.items)) {
          order.items.forEach((item) => {
            allItems.push({
              orderId: order.id,
              name: item.name,
              quantity: item.quantity,
              price: item.price,
              total: item.quantity * item.price,
            });
          });
        }
      });

      setSelectedCustomerOrders(allItems);
      setSelectedCustomerName(customer.full_name || customer.username);
      setOrdersModalVisible(true);
    } catch (err) {
      console.error("Error fetching customer orders:", err);
      MySwal.fire({
        icon: "error",
        title: "Error",
        text: "Failed to fetch customer orders",
      });
    }
  };

  // -------------------- DOWNLOAD CUSTOMERS PDF --------------------
  const downloadCustomersPDF = () => {
    if (!customers.length) {
      return MySwal.fire({
        icon: "info",
        title: "No Customers",
        text: "There are no customers to download.",
      });
    }

    const doc = new jsPDF();
    doc.text("Customers List", 14, 20);

    const tableData = customers.map((cust, index) => [
      index + 1,
      cust.username,
      cust.full_name,
      cust.email,
      cust.phone,
      cust.address,
      cust.status,
    ]);

    autoTable(doc, {
      head: [["#", "Username", "Full Name", "Email", "Phone", "Address", "Status"]],
      body: tableData,
      startY: 30,
      headStyles: { fillColor: [59, 130, 246] },
    });

    doc.save("customers_list.pdf");
  };

  // -------------------- DOWNLOAD ORDERS PDF --------------------
  const downloadOrdersPDF = () => {
    if (!selectedCustomerOrders.length) {
      return MySwal.fire({
        icon: "info",
        title: "No Orders",
        text: "This customer has no orders to download.",
      });
    }

    const doc = new jsPDF();
    doc.text(`Orders for ${selectedCustomerName}`, 14, 20);

    const tableData = selectedCustomerOrders.map((item, index) => [
      index + 1,
      item.name,
      item.quantity,
      `PHP ${item.price}`,
      `PHP ${item.total}`,
    ]);

    autoTable(doc, {
      head: [["#", "Product", "Quantity", "Price", "Total"]],
      body: tableData,
      startY: 30,
      headStyles: { fillColor: [156, 163, 175] },
    });

    const totalQuantity = selectedCustomerOrders.reduce(
      (acc, item) => acc + item.quantity,
      0
    );
    const totalAmount = selectedCustomerOrders.reduce(
      (acc, item) => acc + item.total,
      0
    );

    doc.text(`Total Quantity: ${totalQuantity}`, 14, doc.lastAutoTable.finalY + 10);
    doc.text(`Total Amount: PHP ${totalAmount}`, 14, doc.lastAutoTable.finalY + 20);

    doc.save(`${selectedCustomerName}_orders.pdf`);
  };

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-2xl font-bold">👥 Customers</h2>
        <button
          className="px-3 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
          onClick={downloadCustomersPDF}
        >
         📄 Download PDF
        </button>
      </div>

      {loading ? (
        <p className="text-center text-gray-500">Loading customers...</p>
      ) : (
        <table className="min-w-full table-auto border-collapse">
         <thead>
  <tr className="bg-green-100">
    <th className="border px-3 py-2 w-10 text-center">#</th>
    <th className="border px-3 py-2 w-32">Username</th>
    <th className="border px-3 py-2 w-40">Full Name</th>
    <th className="border px-3 py-2 w-48">Email</th>
    <th className="border px-3 py-2 w-32">Phone</th>

    {/* ⭐ Address Column — widened */}
    <th className="border px-3 py-2 w-[260px]">
      Address
    </th>

    <th className="border px-3 py-2 w-24">Status</th>
    <th className="border px-3 py-2 w-32">Action</th>
  </tr>
</thead>

<tbody>
  {customers.map((cust, index) => (
    <tr key={cust.id} className="hover:bg-gray-100">
      <td className="border px-3 py-2 text-center">{index + 1}</td>
      <td className="border px-3 py-2">{cust.username}</td>
      <td className="border px-3 py-2">{cust.full_name}</td>
      <td className="border px-3 py-2">{cust.email}</td>
      <td className="border px-3 py-2">{cust.phone}</td>

      {/* ⭐ Bigger Address cell */}
      <td className="border px-3 py-2 whitespace-normal break-words">
        {cust.address}
      </td>

      <td className="border px-3 py-2 capitalize">{cust.status}</td>

      <td className="border px-3 py-2 flex gap-2">
        <button
          className={`px-2 py-1 rounded ${
            cust.status === "active"
              ? "bg-red-500 text-white hover:bg-red-600"
              : "bg-green-500 text-white hover:bg-green-600"
          }`}
          onClick={() => toggleCustomerStatus(cust.id, cust.status)}
        >
          {cust.status === "active" ? "Block" : "Activate"}
        </button>

        <button
          className="px-2 py-1 rounded bg-blue-500 text-white hover:bg-blue-600"
          onClick={() => fetchCustomerOrders(cust)}
        >
          Product Purchased
        </button>
      </td>
    </tr>
  ))}
</tbody>

        </table>
      )}

   {/* -------------------- ORDERS MODAL -------------------- */}
{ordersModalVisible && (
  <div className="fixed inset-0 bg-black bg-opacity-50 flex justify-center items-start z-50 overflow-auto">
    <div
      className="bg-white rounded w-11/12 max-w-3xl p-6 relative flex flex-col max-h-[90vh] overflow-auto"
      onClick={(e) => e.stopPropagation()}
    >
      {/* Modal header */}
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-xl font-bold text-center flex-1">
          Orders for {selectedCustomerName}
        </h3>
        <button
          className="text-red-500 font-bold text-lg"
          onClick={() => setOrdersModalVisible(false)}
        >
          ✖
        </button>
      </div>

      {/* Scrollable table container */}
      <div className="flex-1 overflow-auto">
        <table className="min-w-full table-auto border-collapse text-center">
          <thead>
            <tr className="bg-gray-200 sticky top-0">
              <th className="border px-4 py-2 w-10">#</th>
              <th className="border px-4 py-2 flex-1">Product</th>
              <th className="border px-4 py-2 w-1/5">Quantity</th>
              <th className="border px-4 py-2 w-1/5">Price</th>
              <th className="border px-4 py-2 w-1/5">Total</th>
            </tr>
          </thead>
          <tbody>
            {selectedCustomerOrders.length === 0 ? (
              <tr>
                <td colSpan="5" className="text-center py-4">
                  No orders found
                </td>
              </tr>
            ) : (
              selectedCustomerOrders.map((item, index) => (
                <tr key={index} className="hover:bg-gray-100">
                  <td className="border px-4 py-2 w-10">{index + 1}</td>
                  <td className="border px-4 py-2 flex-1">{item.name}</td>
                  <td className="border px-4 py-2 w-1/5">{item.quantity}</td>
                  <td className="border px-4 py-2 w-1/5">PHP {item.price}</td>
                  <td className="border px-4 py-2 w-1/5">PHP {item.total}</td>
                </tr>
              ))
            )}
          </tbody>

          {selectedCustomerOrders.length > 0 && (
            <tfoot>
              {/* Grand totals row */}
              <tr className="bg-gray-100 font-bold">
                <td colSpan="2" className="border px-4 py-2">
                  Total:
                </td>
                <td className="border px-4 py-2 w-1/5">
                  {selectedCustomerOrders
                    .reduce((acc, item) => acc + item.quantity, 0)
                    .toLocaleString()}
                </td>
                <td className="border px-4 py-2 w-1/5"></td>
                <td className="border px-4 py-2 w-1/5">
                  {selectedCustomerOrders
                    .reduce((acc, item) => acc + item.total, 0)
                    .toLocaleString()}
                </td>
              </tr>

              {/* Most bought product */}
              <tr className="bg-gray-200 font-bold">
                <td colSpan="4" className="border px-4 py-2">
                  <span className="font-bold">Most Bought Product:</span>
                </td>
                <td className="border px-4 py-2 w-1/5">
                  {(() => {
                    const productTotals = {};
                    selectedCustomerOrders.forEach((item) => {
                      productTotals[item.name] =
                        (productTotals[item.name] || 0) + item.quantity;
                    });
                    const maxProduct = Object.entries(productTotals).reduce(
                      (prev, curr) => (curr[1] > prev[1] ? curr : prev),
                      ["None", 0]
                    );
                    return `${maxProduct[0]} (${maxProduct[1]})`;
                  })()}
                </td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  </div>
)}

    </div>
  );
}
