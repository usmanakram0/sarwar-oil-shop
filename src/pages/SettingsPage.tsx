import { useEffect, useState } from "react";

import { useForm } from "react-hook-form";

import { zodResolver } from "@hookform/resolvers/zod";

import {
  Download,
  Upload,
  HardDrive,
  Cloud,
  CloudDownload,
} from "lucide-react";

import { useSync } from "@/contexts/SyncContext";
import { useAuth } from "@/contexts/AuthContext";
import { isSupabaseConfigured } from "@/lib/supabase/client";
import { hasSupabaseSession } from "@/lib/supabase/authBridge";
import { reconnectCloudSession } from "@/lib/auth";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

import { Button } from "@/components/ui/button";

import { Input } from "@/components/ui/input";

import { FormLabel } from "@/components/ui/FormLabel";

import {
  settingsStorage,
  backupStorage,
  notifySettingsUpdated,
  isLocalTenantDataEmpty,
  getLocalTenantRecordSummary,
  type ShopSettings,
} from "@/lib/storage";
import { getLastPulledAt } from "@/lib/offline/syncEngine";

import { settingsSchema, type SettingsFormData } from "@/lib/validation";

import { useSettingsMutation } from "@/hooks/useShopMutations";

import { SHOP_NAME } from "@/lib/shop";

import { toast } from "sonner";

import { Progress } from "@/components/ui/progress";
import ConfirmDataOverwriteDialog from "@/components/ConfirmDataOverwriteDialog";

export default function SettingsPage() {
  const [settings, setSettings] = useState<ShopSettings>(settingsStorage.get());

  const [storageUsage] = useState(backupStorage.getStorageUsage());

  const [lastBackupAt, setLastBackupAt] = useState(
    backupStorage.getLastBackupAt(),
  );

  const {
    syncNow,
    pullFromCloud,
    lastSyncedAt,
    pendingChanges,
    isOnline,
    status,
  } = useSync();
  const { session } = useAuth();

  const [syncing, setSyncing] = useState(false);
  const [pulling, setPulling] = useState(false);
  const [cloudConnected, setCloudConnected] = useState<boolean | null>(null);
  const [lastPulledAt, setLastPulledAt] = useState<string | null>(() =>
    getLastPulledAt(),
  );
  const localDataEmpty = isLocalTenantDataEmpty();
  const localRecordSummary = getLocalTenantRecordSummary();

  const [cloudDownloadDialogOpen, setCloudDownloadDialogOpen] = useState(false);
  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const [pendingImportJson, setPendingImportJson] = useState<string | null>(null);

  useEffect(() => {
    if (!isSupabaseConfigured) return;
    void hasSupabaseSession().then(setCloudConnected);
  }, [status, lastSyncedAt, session?.userId]);

  const updateSettings = useSettingsMutation();

  const form = useForm<SettingsFormData>({
    resolver: zodResolver(settingsSchema),

    defaultValues: settings,
  });

  const onSubmit = (data: SettingsFormData) => {
    updateSettings.mutate(data, {
      onSuccess: (updated: ShopSettings) => {
        setSettings(updated);

        notifySettingsUpdated();

        toast.success("Settings saved");
      },

      onError: () => toast.error("Could not save settings"),
    });
  };

  const handleExport = () => {
    backupStorage.download();

    setLastBackupAt(backupStorage.getLastBackupAt());

    toast.success("Backup downloaded");
  };

  const handleImport = () => {
    const input = document.createElement("input");

    input.type = "file";

    input.accept = ".json";

    input.onchange = (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];

      if (!file) return;

      const reader = new FileReader();

      reader.onload = () => {
        setPendingImportJson(reader.result as string);
        setImportDialogOpen(true);
      };

      reader.readAsText(file);
    };

    input.click();
  };

  const handleConfirmImport = () => {
    if (!pendingImportJson) return;

    const result = backupStorage.import(pendingImportJson);
    setPendingImportJson(null);
    setImportDialogOpen(false);

    if (result.success) {
      toast.success(result.message);
      setSettings(settingsStorage.get());
      form.reset(settingsStorage.get());
      notifySettingsUpdated();
      return;
    }

    toast.error(result.message);
  };

  const handleConfirmCloudDownload = async () => {
    setPulling(true);
    const result = await pullFromCloud(!localDataEmpty);
    setPulling(false);
    setCloudDownloadDialogOpen(false);
    setLastPulledAt(getLastPulledAt());

    if (result.ok) {
      toast.success(result.message || "Downloaded shop data from cloud");
      return;
    }

    toast.error(result.message || "Could not download from cloud");
  };

  const usedMB = (storageUsage.used / (1024 * 1024)).toFixed(2);

  const totalMB = (storageUsage.total / (1024 * 1024)).toFixed(0);

  const backupDue = backupStorage.isBackupDue();

  return (
    <div className="space-y-6 pb-16 lg:pb-0 animate-fade-in max-w-2xl">
      <h1 className="text-2xl font-heading font-bold">Settings</h1>

      {/* Shop Settings */}

      <Card>
        <CardHeader>
          <CardTitle className="font-heading text-base">
            Sarwar Oil Shop Details
          </CardTitle>
        </CardHeader>

        <CardContent>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            {/* <div>
              <Label>Shop Name</Label>

              <Input value={SHOP_NAME} readOnly disabled className="bg-muted" />

              <p className="text-xs text-muted-foreground mt-1">
                Store name is fixed for this app.
              </p>
            </div> */}

            <div>
              <FormLabel>Address</FormLabel>

              <Input {...form.register("shopAddress")} />
            </div>

            <div>
              <FormLabel>Phone</FormLabel>

              <Input {...form.register("shopPhone")} />
            </div>

            <div>
              <FormLabel>Invoice "Thanks" Message</FormLabel>

              <Input {...form.register("thankYouMessage")} />
            </div>

            <Button type="submit">Save Settings</Button>
          </form>
        </CardContent>
      </Card>

      {/* <Card>
        <CardHeader>
          <CardTitle className="font-heading text-base flex items-center gap-2">
            <Printer className="w-4 h-4" />
            Instant Receipt Printing
          </CardTitle>
        </CardHeader>

        <CardContent className="space-y-3 text-sm">
          <p className="text-muted-foreground">
            For one-click Bill / Gate Pass printing without the browser popup, keep the local print bridge running on this shop PC.
          </p>

          <div className="rounded-lg border p-3 space-y-1">
            <p>
              Status:{" "}
              {printBridgeOnline === null ? (
                <span className="text-muted-foreground">Checking…</span>
              ) : printBridgeOnline ? (
                <span className="text-success font-medium">Ready</span>
              ) : (
                <span className="text-destructive font-medium">Not running</span>
              )}
            </p>
            <p className="text-muted-foreground">
              Saved layout: Envelope Monarch, portrait, minimum margins, 100% scale.
            </p>
          </div>

          <div className="rounded-lg bg-muted/40 p-3 font-mono text-xs space-y-1">
            <p>Manual start: scripts\start-print-bridge.bat</p>
            <p>One-time auto-start: scripts\install-print-bridge-startup.bat</p>
          </div>

          <p className="text-xs text-muted-foreground">
            Run the install file once. After that, Windows starts the print bridge automatically every time you sign in.
            Print Both sends two separate jobs so the thermal printer can auto-cut after the bill, then print the gate pass.
          </p>
        </CardContent>
      </Card> */}

      {isSupabaseConfigured && (
        <Card>
          <CardHeader>
            <CardTitle className="font-heading text-base flex items-center gap-2">
              <Cloud className="w-4 h-4" />
              Cloud sync
            </CardTitle>
          </CardHeader>

          <CardContent className="space-y-3 text-sm">
            <p className="text-muted-foreground">
              Data is saved on this device first. Upload sends your local copy
              to the cloud. Downloading from cloud replaces everything on this
              device — it never runs automatically.
            </p>

            {!localDataEmpty && (
              <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">
                This device has {localRecordSummary.invoices} invoices and{" "}
                {localRecordSummary.total} total records saved locally. Only use
                &quot;Replace device data from cloud&quot; if you are sure the
                cloud copy is newer and complete.
              </div>
            )}

            {session && (
              <div className="rounded-lg border bg-muted/30 px-3 py-2 space-y-1 text-xs">
                <p>
                  <span className="text-muted-foreground">App login:</span>{" "}
                  {session.email}
                </p>
                <p>
                  <span className="text-muted-foreground">Cloud:</span>{" "}
                  {cloudConnected === null
                    ? "Checking…"
                    : cloudConnected
                      ? "Connected"
                      : "Not connected — sync paused"}
                </p>
              </div>
            )}

            {lastSyncedAt && (
              <p className="text-muted-foreground">
                Last uploaded: {new Date(lastSyncedAt).toLocaleString()}
              </p>
            )}

            {lastPulledAt && (
              <p className="text-muted-foreground">
                Last downloaded: {new Date(lastPulledAt).toLocaleString()}
              </p>
            )}

            {localDataEmpty && (
              <p className="text-amber-700 dark:text-amber-300">
                No local shop records on this device. You will be asked to
                confirm before anything is downloaded from the cloud.
              </p>
            )}

            {pendingChanges && (
              <p className="text-amber-700 dark:text-amber-300">
                Local changes waiting to upload
              </p>
            )}

            {cloudConnected === false && (
              <Button
                variant="secondary"
                className="w-full"
                disabled={syncing || !isOnline}
                onClick={async () => {
                  setSyncing(true);
                  const reconnect = await reconnectCloudSession();
                  if (!reconnect.ok) {
                    setSyncing(false);
                    toast.error(
                      reconnect.message || "Could not connect to cloud",
                    );
                    return;
                  }
                  setCloudConnected(true);
                  const result = await syncNow();
                  setSyncing(false);
                  if (result.ok) toast.success("Connected and synced to cloud");
                  else
                    toast.error(result.message || "Connected but sync failed");
                }}>
                Connect cloud & sync
              </Button>
            )}

            <Button
              variant="secondary"
              className="w-full"
              disabled={pulling || syncing || !isOnline || status === "syncing"}
              onClick={() => setCloudDownloadDialogOpen(true)}>
              <CloudDownload className="w-4 h-4 mr-2" />
              {pulling ? "Downloading…" : "Replace device data from cloud"}
            </Button>

            <Button
              variant="outline"
              className="w-full"
              disabled={syncing || !isOnline || status === "syncing"}
              onClick={async () => {
                setSyncing(true);

                const result = await syncNow();

                setSyncing(false);

                if (result.ok) toast.success("Synced to cloud");
                else toast.error(result.message || "Sync failed");
              }}>
              {syncing || status === "syncing"
                ? "Syncing…"
                : "Upload to cloud now"}
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Storage */}

      <Card>
        <CardHeader>
          <CardTitle className="font-heading text-base flex items-center gap-2">
            <HardDrive className="w-4 h-4" />
            Storage
          </CardTitle>
        </CardHeader>

        <CardContent className="space-y-4">
          <div>
            <div className="flex justify-between text-sm mb-1">
              <span className="text-muted-foreground">Used: {usedMB} MB</span>

              <span className="text-muted-foreground">{totalMB} MB</span>
            </div>

            <Progress value={storageUsage.percentage} />
          </div>
        </CardContent>
      </Card>

      {/* Backup */}

      <Card>
        <CardHeader>
          <CardTitle className="font-heading text-base">
            Backup & Restore
          </CardTitle>
        </CardHeader>

        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            {lastBackupAt
              ? `Last backup: ${lastBackupAt.toLocaleString()}`
              : "No backup exported yet"}
          </p>

          {backupDue && (
            <p className="text-sm text-amber-700 dark:text-amber-300">
              It has been over a week since your last backup. Export your data
              to stay safe.
            </p>
          )}

          <Button variant="outline" className="w-full" onClick={handleExport}>
            <Download className="w-4 h-4 mr-2" />
            Export Backup
          </Button>

          <Button variant="outline" className="w-full" onClick={handleImport}>
            <Upload className="w-4 h-4 mr-2" />
            Import Backup
          </Button>

          <p className="text-xs text-muted-foreground">
            Import replaces all shop data on this device with the backup file.
            You will be asked to confirm before anything changes.
          </p>
        </CardContent>
      </Card>

      <ConfirmDataOverwriteDialog
        open={cloudDownloadDialogOpen}
        onOpenChange={setCloudDownloadDialogOpen}
        title="Replace device data from cloud?"
        actionLabel="Yes, overwrite device data from cloud"
        summary={localRecordSummary}
        warnings={
          localDataEmpty
            ? [
                "All shop records on this device will be replaced with the cloud copy.",
                "If the cloud copy is older or incomplete, recent invoices may be lost.",
              ]
            : [
                "All shop records on this device will be permanently replaced with the cloud copy.",
                "Any invoices or changes that never uploaded to the cloud will be lost.",
                "If cloud sync failed earlier, the cloud copy may be missing recent records.",
              ]
        }
        onConfirm={handleConfirmCloudDownload}
        isLoading={pulling}
      />

      <ConfirmDataOverwriteDialog
        open={importDialogOpen}
        onOpenChange={(open) => {
          setImportDialogOpen(open);
          if (!open) setPendingImportJson(null);
        }}
        title="Restore from backup file?"
        actionLabel="Yes, overwrite device data from backup"
        summary={localRecordSummary}
        warnings={[
          "All shop records on this device will be replaced with the backup file you selected.",
          "Any records created after that backup was exported will be lost unless you exported again.",
        ]}
        onConfirm={handleConfirmImport}
      />
    </div>
  );
}
