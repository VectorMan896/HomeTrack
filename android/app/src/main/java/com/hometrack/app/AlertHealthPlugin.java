package com.hometrack.app;

import android.app.AlarmManager;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.os.PowerManager;
import android.provider.Settings;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * AlertHealth — checks the phone settings that decide whether scheduled alerts
 * actually fire (battery optimisation, exact alarms) and opens the screens to fix them.
 * Many phones (Xiaomi, Samsung, Oppo, Huawei…) also need "Autostart" allowed in the
 * app's settings so alarms are restored after a restart.
 */
@CapacitorPlugin(name = "AlertHealth")
public class AlertHealthPlugin extends Plugin {

  @PluginMethod
  public void status(PluginCall call) {
    Context ctx = getContext();
    JSObject r = new JSObject();
    boolean batteryOk = true;
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
      PowerManager pm = (PowerManager) ctx.getSystemService(Context.POWER_SERVICE);
      batteryOk = pm != null && pm.isIgnoringBatteryOptimizations(ctx.getPackageName());
    }
    boolean exactOk = true;
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
      AlarmManager am = (AlarmManager) ctx.getSystemService(Context.ALARM_SERVICE);
      exactOk = am != null && am.canScheduleExactAlarms();
    }
    r.put("batteryOk", batteryOk);
    r.put("exactOk", exactOk);
    r.put("manufacturer", Build.MANUFACTURER == null ? "" : Build.MANUFACTURER);
    call.resolve(r);
  }

  @PluginMethod
  public void openBattery(PluginCall call) {
    Context ctx = getContext();
    String pkg = ctx.getPackageName();
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
      if (tryStart(new Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS, Uri.parse("package:" + pkg)))) { call.resolve(); return; }
      if (tryStart(new Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS))) { call.resolve(); return; }
    }
    openAppSettings(call);
  }

  @PluginMethod
  public void openExactAlarms(PluginCall call) {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S
        && tryStart(new Intent(Settings.ACTION_REQUEST_SCHEDULE_EXACT_ALARM, Uri.parse("package:" + getContext().getPackageName())))) {
      call.resolve(); return;
    }
    openAppSettings(call);
  }

  @PluginMethod
  public void openAppSettings(PluginCall call) {
    if (tryStart(new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:" + getContext().getPackageName())))) call.resolve();
    else call.reject("Could not open settings");
  }

  private boolean tryStart(Intent i) {
    try {
      i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
      getContext().startActivity(i);
      return true;
    } catch (Exception e) {
      return false;
    }
  }
}
