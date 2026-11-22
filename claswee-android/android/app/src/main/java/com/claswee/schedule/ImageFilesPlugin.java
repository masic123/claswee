package com.claswee.schedule;

import android.app.Activity;
import android.content.ContentValues;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.provider.MediaStore;
import android.util.Base64;
import androidx.activity.result.ActivityResult;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.OutputStream;

@CapacitorPlugin(name = "ImageFiles")
public class ImageFilesPlugin extends Plugin {
    @PluginMethod
    public void save(PluginCall call) {
        String data = call.getString("data");
        if (data == null || data.length() > 24000000) {
            call.reject("图片数据无法保存");
            return;
        }
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) {
            Intent intent = new Intent(Intent.ACTION_CREATE_DOCUMENT);
            intent.addCategory(Intent.CATEGORY_OPENABLE);
            intent.setType("image/png");
            intent.putExtra(Intent.EXTRA_TITLE, call.getString("name", "claswee周课表.png"));
            startActivityForResult(call, intent, "documentCreated");
            return;
        }
        Uri uri = null;
        try {
            ContentValues values = new ContentValues();
            values.put(MediaStore.Images.Media.DISPLAY_NAME, "claswee-" + System.currentTimeMillis() + ".png");
            values.put(MediaStore.Images.Media.MIME_TYPE, "image/png");
            values.put(MediaStore.Images.Media.RELATIVE_PATH, Environment.DIRECTORY_PICTURES + "/claswee");
            values.put(MediaStore.Images.Media.IS_PENDING, 1);
            uri = getContext().getContentResolver().insert(MediaStore.Images.Media.EXTERNAL_CONTENT_URI, values);
            if (uri == null) throw new IllegalStateException("无法创建相册文件");
            writeImage(uri, data);
            ContentValues completed = new ContentValues();
            completed.put(MediaStore.Images.Media.IS_PENDING, 0);
            getContext().getContentResolver().update(uri, completed, null, null);
            JSObject result = new JSObject(); result.put("uri", uri.toString()); call.resolve(result);
        } catch (Exception error) {
            if (uri != null) getContext().getContentResolver().delete(uri, null, null);
            call.reject("保存图片失败，请重试", error);
        }
    }

    private void writeImage(Uri uri, String data) throws Exception {
        try (OutputStream stream = getContext().getContentResolver().openOutputStream(uri)) {
            if (stream == null) throw new IllegalStateException("无法写入图片");
            stream.write(Base64.decode(data, Base64.DEFAULT));
        }
    }

    @ActivityCallback
    private void documentCreated(PluginCall call, ActivityResult activityResult) {
        if (call == null) return;
        Intent result = activityResult.getData();
        if (activityResult.getResultCode() != Activity.RESULT_OK || result == null || result.getData() == null) {
            call.reject("已取消保存"); return;
        }
        try {
            writeImage(result.getData(), call.getString("data"));
            JSObject saved = new JSObject(); saved.put("uri", result.getData().toString()); call.resolve(saved);
        } catch (Exception error) { call.reject("保存图片失败，请重试", error); }
    }
}
