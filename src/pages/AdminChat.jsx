// deno-lint-ignore-file
// src/AdminChat.jsx
import React, { useState, useEffect, useRef } from "react";
import { supabase } from "../lib/supabaseClient.js";
import Swal from "sweetalert2";
import withReactContent from "sweetalert2-react-content";

const MySwal = withReactContent(Swal);

export default function AdminChat({ adminId }) {
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
      MySwal.fire("Error", "Failed to fetch inbox messages.", "error");
      setInboxUsers([]);
      setUnreadCounts({});
    }
  };

  // -------------------- FETCH CHAT --------------------
  const fetchChatMessages = async (customer) => {
    try {
      const { data, error } = await supabase
        .from("messages")
        .select("*")
        .or(
          `and(sender_id.eq.${customer.id},receiver_id.eq.${adminId}),and(sender_id.eq.${adminId},receiver_id.eq.${customer.id})`
        )
        .order("created_at", { ascending: true });

      if (error) throw error;

      setChatMessages((prev) => ({ ...prev, [customer.id]: data || [] }));

      await supabase
        .from("messages")
        .update({ read: true })
        .eq("sender_id", customer.id)
        .eq("receiver_id", adminId)
        .eq("read", false);

      setUnreadCounts((prev) => ({ ...prev, [customer.id]: 0 }));

      setTimeout(
        () =>
          chatEndRefs.current[customer.id]?.scrollIntoView({
            behavior: "smooth",
          }),
        100
      );
    } catch (err) {
      console.error("Fetch chat error:", err);
      MySwal.fire(
        "Error",
        `Failed to fetch chat messages with ${customer.name}.`,
        "error"
      );
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
      if (!error) setNewMessage((prev) => ({ ...prev, [customerId]: "" }));
      else {
        console.error("Send message error:", error);
        MySwal.fire("Error", "Failed to send message.", "error");
      }
    } catch (err) {
      console.error("Send message exception:", err);
      MySwal.fire("Error", "Failed to send message.", "error");
    }
  };

  // -------------------- REAL-TIME UPDATES --------------------
  useEffect(() => {
    fetchInbox();

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

          if (newMsg.receiver_id === adminId && !openChats.find((c) => c.id === otherId)) {
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

    channelRef.current = { chatChannel };

    return () => {
      supabase.removeChannel(channelRef.current.chatChannel);
    };
  }, [openChats]);

  // -------------------- RENDER --------------------
  const renderInboxDropdown = () => (
    <div className="absolute right-4 top-12 bg-white border rounded shadow-lg w-80 max-h-96 overflow-auto z-50">
      <div className="p-2 font-bold border-b">Messages</div>
      {inboxUsers.length > 0 ? (
        inboxUsers.map((c) => (
          <div
            key={c.id}
            className="p-2 border-b cursor-pointer hover:bg-gray-100 flex justify-between items-center"
            onClick={() => openChat(c)}
          >
            <div>
              <div className="font-bold">{c.name}</div>
              <div className="text-sm text-gray-600 truncate max-w-xs">
                {c.lastMessage}
              </div>
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
                  className={`flex mb-2 ${isAdmin ? "justify-end" : "justify-start"}`}
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
              setNewMessage((prev) => ({ ...prev, [customer.id]: e.target.value }))
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

  return (
    <>
      <button
        className="text-white rounded-full hover:text-gray-300 absolute right-8 top-5"
        onClick={() => {
          setShowInbox(!showInbox);
          fetchInbox();
        }}
      >
        💬
      </button>
      {showInbox && renderInboxDropdown()}
      {renderChatBoxes()}
      {totalUnread > 0 && (
        <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs font-bold px-1.5 py-0.5 rounded-full">
          {totalUnread}
        </span>
      )}
    </>
  );
}
