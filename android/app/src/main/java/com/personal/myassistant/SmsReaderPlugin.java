package com.personal.myassistant;

import android.Manifest;
import android.content.pm.PackageManager;
import android.database.Cursor;
import android.net.Uri;
import android.provider.Telephony;
import android.util.Log;

import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

import org.json.JSONException;

import java.util.Calendar;

/**
 * SmsReaderPlugin - Native Capacitor plugin to read SMS inbox
 * 
 * Security: This plugin only reads SMS from the inbox.
 * It does NOT send SMS or access other sensitive data.
 * SMS content is filtered locally before any AI processing.
 */
@CapacitorPlugin(
    name = "SmsReader",
    permissions = {
        @Permission(
            alias = "sms",
            strings = { Manifest.permission.READ_SMS }
        )
    }
)
public class SmsReaderPlugin extends Plugin {
    
    private static final String TAG = "SmsReaderPlugin";
    private static final int SMS_PERMISSION_REQUEST = 1001;
    
    /**
     * Check if SMS permission is granted
     */
    @PluginMethod
    public void checkPermission(PluginCall call) {
        JSObject result = new JSObject();
        boolean granted = ContextCompat.checkSelfPermission(
            getContext(), 
            Manifest.permission.READ_SMS
        ) == PackageManager.PERMISSION_GRANTED;
        
        result.put("granted", granted);
        call.resolve(result);
    }
    
    /**
     * Request SMS permission
     */
    @PluginMethod
    public void requestPermission(PluginCall call) {
        if (ContextCompat.checkSelfPermission(getContext(), Manifest.permission.READ_SMS) 
                == PackageManager.PERMISSION_GRANTED) {
            JSObject result = new JSObject();
            result.put("granted", true);
            call.resolve(result);
            return;
        }
        
        // Save the call to resolve later
        saveCall(call);
        
        // Request permission
        requestPermissionForAlias("sms", call, "smsPermissionCallback");
    }
    
    /**
     * Callback after permission request
     */
    @PermissionCallback
    private void smsPermissionCallback(PluginCall call) {
        JSObject result = new JSObject();
        boolean granted = ContextCompat.checkSelfPermission(
            getContext(), 
            Manifest.permission.READ_SMS
        ) == PackageManager.PERMISSION_GRANTED;
        
        result.put("granted", granted);
        call.resolve(result);
    }
    
    /**
     * Read SMS messages from inbox
     * 
     * @param daysBack - Number of days to look back (default 60)
     * @param senderPattern - Optional regex pattern to filter senders
     */
    @PluginMethod
    public void readInbox(PluginCall call) {
        // Check permission first
        if (ContextCompat.checkSelfPermission(getContext(), Manifest.permission.READ_SMS) 
                != PackageManager.PERMISSION_GRANTED) {
            call.reject("SMS permission not granted");
            return;
        }
        
        int daysBack = call.getInt("daysBack", 60);
        String senderPattern = call.getString("senderPattern", null);
        
        JSArray messages = new JSArray();
        
        try {
            // Calculate date threshold
            Calendar calendar = Calendar.getInstance();
            calendar.add(Calendar.DAY_OF_YEAR, -daysBack);
            long dateThreshold = calendar.getTimeInMillis();
            
            // Query SMS inbox
            Uri uri = Uri.parse("content://sms/inbox");
            String[] projection = new String[] {
                "_id",
                "address",  // Sender
                "body",     // Message content
                "date"      // Timestamp
            };
            
            String selection = "date > ?";
            String[] selectionArgs = new String[] { String.valueOf(dateThreshold) };
            String sortOrder = "date DESC";
            
            Cursor cursor = getContext().getContentResolver().query(
                uri,
                projection,
                selection,
                selectionArgs,
                sortOrder
            );
            
            if (cursor != null) {
                int idIndex = cursor.getColumnIndex("_id");
                int addressIndex = cursor.getColumnIndex("address");
                int bodyIndex = cursor.getColumnIndex("body");
                int dateIndex = cursor.getColumnIndex("date");
                
                while (cursor.moveToNext()) {
                    String sender = cursor.getString(addressIndex);
                    
                    // Apply sender filter if provided
                    if (senderPattern != null && !sender.matches(senderPattern)) {
                        continue;
                    }
                    
                    JSObject sms = new JSObject();
                    sms.put("id", cursor.getString(idIndex));
                    sms.put("sender", sender);
                    sms.put("body", cursor.getString(bodyIndex));
                    sms.put("date", cursor.getLong(dateIndex));
                    
                    messages.put(sms);
                }
                cursor.close();
            }
            
            JSObject result = new JSObject();
            result.put("messages", messages);
            result.put("count", messages.length());
            
            Log.d(TAG, "Read " + messages.length() + " SMS messages");
            call.resolve(result);
            
        } catch (Exception e) {
            Log.e(TAG, "Error reading SMS: " + e.getMessage());
            call.reject("Failed to read SMS: " + e.getMessage());
        }
    }
    
    /**
     * Read a single SMS by ID
     */
    @PluginMethod
    public void readSmsById(PluginCall call) {
        String smsId = call.getString("id");
        
        if (smsId == null) {
            call.reject("SMS ID is required");
            return;
        }
        
        // Check permission
        if (ContextCompat.checkSelfPermission(getContext(), Manifest.permission.READ_SMS) 
                != PackageManager.PERMISSION_GRANTED) {
            call.reject("SMS permission not granted");
            return;
        }
        
        try {
            Uri uri = Uri.parse("content://sms/inbox");
            String[] projection = new String[] {
                "_id", "address", "body", "date"
            };
            
            String selection = "_id = ?";
            String[] selectionArgs = new String[] { smsId };
            
            Cursor cursor = getContext().getContentResolver().query(
                uri, projection, selection, selectionArgs, null
            );
            
            if (cursor != null && cursor.moveToFirst()) {
                JSObject sms = new JSObject();
                sms.put("id", cursor.getString(cursor.getColumnIndex("_id")));
                sms.put("sender", cursor.getString(cursor.getColumnIndex("address")));
                sms.put("body", cursor.getString(cursor.getColumnIndex("body")));
                sms.put("date", cursor.getLong(cursor.getColumnIndex("date")));
                
                cursor.close();
                call.resolve(sms);
            } else {
                call.reject("SMS not found");
            }
            
        } catch (Exception e) {
            call.reject("Failed to read SMS: " + e.getMessage());
        }
    }
}



