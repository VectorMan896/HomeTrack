package com.hometrack.app;

import android.Manifest;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.database.Cursor;
import android.net.Uri;
import android.os.Build;
import android.provider.Telephony;
import android.telephony.SmsMessage;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

/**
 * SmsReader — reads the SMS inbox on demand (catch-up for messages received
 * while the app was closed) and emits `smsReceived` events live while the app
 * is running. Used to auto-capture M-Pesa / bank transaction texts.
 */
@CapacitorPlugin(
  name = "SmsReader",
  permissions = {
    @Permission(alias = "sms", strings = { Manifest.permission.READ_SMS, Manifest.permission.RECEIVE_SMS })
  }
)
public class SmsReaderPlugin extends Plugin {
  private BroadcastReceiver receiver;

  @Override
  public void load() {
    receiver = new BroadcastReceiver() {
      @Override
      public void onReceive(Context context, Intent intent) {
        if (!Telephony.Sms.Intents.SMS_RECEIVED_ACTION.equals(intent.getAction())) return;
        SmsMessage[] msgs = Telephony.Sms.Intents.getMessagesFromIntent(intent);
        if (msgs == null || msgs.length == 0) return;
        StringBuilder body = new StringBuilder();
        String address = "";
        for (SmsMessage m : msgs) { body.append(m.getMessageBody()); address = m.getOriginatingAddress(); }
        JSObject data = new JSObject();
        data.put("address", address == null ? "" : address);
        data.put("body", body.toString());
        data.put("date", System.currentTimeMillis());
        notifyListeners("smsReceived", data);
      }
    };
    IntentFilter filter = new IntentFilter(Telephony.Sms.Intents.SMS_RECEIVED_ACTION);
    filter.setPriority(999);
    if (Build.VERSION.SDK_INT >= 34) {
      getContext().registerReceiver(receiver, filter, Context.RECEIVER_EXPORTED);
    } else {
      getContext().registerReceiver(receiver, filter);
    }
  }

  @Override
  protected void handleOnDestroy() {
    if (receiver != null) { try { getContext().unregisterReceiver(receiver); } catch (Exception e) {} }
  }

  @PluginMethod
  public void requestPermission(PluginCall call) {
    if (getPermissionState("sms") == PermissionState.GRANTED) {
      JSObject r = new JSObject(); r.put("granted", true); call.resolve(r);
    } else {
      requestPermissionForAlias("sms", call, "permCallback");
    }
  }

  @PermissionCallback
  private void permCallback(PluginCall call) {
    JSObject r = new JSObject();
    r.put("granted", getPermissionState("sms") == PermissionState.GRANTED);
    call.resolve(r);
  }

  @PluginMethod
  public void readMessages(PluginCall call) {
    if (getPermissionState("sms") != PermissionState.GRANTED) { call.reject("Permission not granted"); return; }
    Long sinceL = call.getLong("since");
    long since = sinceL == null ? 0L : sinceL;
    Integer maxI = call.getInt("max");
    int max = maxI == null ? 300 : maxI;

    JSArray out = new JSArray();
    Cursor c = null;
    try {
      Uri uri = Uri.parse("content://sms/inbox");
      c = getContext().getContentResolver().query(
        uri, new String[]{ "_id", "address", "body", "date" },
        "date > ?", new String[]{ String.valueOf(since) }, "date DESC");
      int count = 0;
      if (c != null) {
        int iId = c.getColumnIndex("_id"), iAddr = c.getColumnIndex("address"), iBody = c.getColumnIndex("body"), iDate = c.getColumnIndex("date");
        while (c.moveToNext() && count < max) {
          JSObject o = new JSObject();
          o.put("id", c.getString(iId));
          o.put("address", c.getString(iAddr));
          o.put("body", c.getString(iBody));
          o.put("date", c.getLong(iDate));
          out.put(o);
          count++;
        }
      }
    } catch (Exception e) {
      call.reject("read failed: " + e.getMessage()); return;
    } finally { if (c != null) c.close(); }

    JSObject res = new JSObject();
    res.put("messages", out);
    call.resolve(res);
  }
}
