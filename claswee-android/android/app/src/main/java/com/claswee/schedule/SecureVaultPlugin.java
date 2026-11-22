package com.claswee.schedule;

import android.content.Context;
import android.content.SharedPreferences;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import android.util.Base64;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.nio.charset.StandardCharsets;
import java.security.KeyStore;
import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;

@CapacitorPlugin(name = "SecureVault")
public class SecureVaultPlugin extends Plugin {
    private static final String ALIAS = "claswee-room-key-v1";
    private SharedPreferences preferences() {
        return getContext().getSharedPreferences("claswee_secure_connection", Context.MODE_PRIVATE);
    }
    private SecretKey key(boolean mayCreate) throws Exception {
        KeyStore store = KeyStore.getInstance("AndroidKeyStore");
        store.load(null);
        if (!store.containsAlias(ALIAS)) {
            if (!mayCreate) throw new IllegalStateException("房间加密密钥暂不可用，请重新启动手机后再试");
            KeyGenerator generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore");
            generator.init(new KeyGenParameterSpec.Builder(ALIAS, KeyProperties.PURPOSE_ENCRYPT | KeyProperties.PURPOSE_DECRYPT)
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                .setRandomizedEncryptionRequired(true)
                .build());
            generator.generateKey();
        }
        return ((KeyStore.SecretKeyEntry) store.getEntry(ALIAS, null)).getSecretKey();
    }
    @PluginMethod
    public void get(PluginCall call) {
        try {
            String encrypted = preferences().getString("value", null);
            JSObject result = new JSObject();
            if (encrypted != null) {
                String iv = preferences().getString("iv", null);
                if (iv == null) throw new IllegalStateException("房间连接记录不完整");
                Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
                cipher.init(Cipher.DECRYPT_MODE, key(false), new GCMParameterSpec(128, Base64.decode(iv, Base64.NO_WRAP)));
                result.put("value", new String(cipher.doFinal(Base64.decode(encrypted, Base64.NO_WRAP)), StandardCharsets.UTF_8));
            }
            call.resolve(result);
        } catch (Exception error) {
            // Preserve the ciphertext and device identity on temporary Keystore failures.
            call.reject("无法读取加密房间连接，请重启手机后重试；连接记录已保留", "VAULT_READ_FAILED");
        }
    }
    @PluginMethod
    public void set(PluginCall call) {
        String value = call.getString("value");
        if (value == null || value.length() > 32768) { call.reject("连接数据格式无效"); return; }
        try {
            Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
            cipher.init(Cipher.ENCRYPT_MODE, key(true));
            String encrypted = Base64.encodeToString(cipher.doFinal(value.getBytes(StandardCharsets.UTF_8)), Base64.NO_WRAP);
            boolean saved = preferences().edit()
                .putString("value", encrypted)
                .putString("iv", Base64.encodeToString(cipher.getIV(), Base64.NO_WRAP))
                .commit();
            if (!saved) throw new IllegalStateException("Storage commit failed");
            call.resolve();
        } catch (Exception error) { call.reject("无法保存房间连接，请检查手机存储空间", "VAULT_WRITE_FAILED"); }
    }
}
