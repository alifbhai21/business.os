"use client";

import React, { useState, useEffect } from "react";
import { Smartphone, ShieldCheck, History, CheckCircle, Ban } from "lucide-react";
import { Language, translations } from "@/lib/i18n";

interface DevicesViewProps {
  lang: Language;
}

export const DevicesView: React.FC<DevicesViewProps> = ({ lang }) => {
  const isBn = lang === "bn";
  const t = translations[lang];

  const [devicesList, setDevicesList] = useState<any[]>([]);
  const [auditLogs, setAuditLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const [devRes, auditRes] = await Promise.all([
        fetch("/api/v1/devices"),
        fetch("/api/v1/audit"),
      ]);
      const devJson = await devRes.json();
      const auditJson = await auditRes.json();

      if (devJson.success) setDevicesList(devJson.data);
      if (auditJson.success) setAuditLogs(auditJson.data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const toggleDeviceAccess = async (id: string, currentStatus: string) => {
    const nextStatus = currentStatus === "active" ? "revoked" : "active";
    try {
      await fetch("/api/v1/devices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deviceId: id, status: nextStatus }),
      });
      fetchData();
    } catch (e) {
      console.error(e);
    }
  };

  return (
    <div className="space-y-4">
      {/* Registered Devices */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-3">
        <div className="flex items-center gap-2 border-b border-slate-800 pb-2">
          <Smartphone className="w-4 h-4 text-emerald-400" />
          <h3 className="font-bold text-xs text-white">Registered Mobile Devices</h3>
        </div>

        <div className="space-y-2">
          {devicesList.map((dev) => (
            <div
              key={dev.id}
              className="p-3 bg-slate-950 border border-slate-800 rounded-xl flex items-center justify-between text-xs"
            >
              <div>
                <p className="font-bold text-slate-200">{dev.deviceName}</p>
                <p className="text-[10px] text-slate-400 font-mono mt-0.5">
                  ID: {dev.deviceId} | User: {dev.userPhone} | Version: {dev.appVersion}
                </p>
              </div>

              <button
                onClick={() => toggleDeviceAccess(dev.id, dev.status)}
                className={`px-2.5 py-1 rounded-lg text-[10px] font-semibold border transition ${
                  dev.status === "active"
                    ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/30"
                    : "bg-rose-500/20 text-rose-300 border-rose-500/30"
                }`}
              >
                {dev.status === "active" ? "Access Active" : "Access Revoked"}
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* Audit Log */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-3">
        <div className="flex items-center gap-2 border-b border-slate-800 pb-2">
          <History className="w-4 h-4 text-teal-400" />
          <h3 className="font-bold text-xs text-white">System Audit Trail</h3>
        </div>

        <div className="space-y-2 max-h-60 overflow-y-auto">
          {auditLogs.map((log) => (
            <div
              key={log.id}
              className="p-2.5 bg-slate-950/80 border border-slate-800/80 rounded-xl text-xs flex justify-between items-center"
            >
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-emerald-400 text-[11px]">
                    [{log.action}]
                  </span>
                  <span className="text-slate-300 text-[11px]">{log.details}</span>
                </div>
                <p className="text-[10px] text-slate-500 mt-0.5 font-mono">
                  {new Date(log.createdAt).toLocaleString()} • User: {log.userPhone}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
