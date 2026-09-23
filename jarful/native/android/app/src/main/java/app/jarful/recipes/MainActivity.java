package app.jarful.recipes;

import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

// Receives text/links shared from other apps and opens the web app's import sheet
// (app.js reads ?url= / ?text= on boot).
public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        handleShare(getIntent());
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        handleShare(intent);
    }

    private void handleShare(Intent intent) {
        if (intent == null || !Intent.ACTION_SEND.equals(intent.getAction())) return;
        String text = intent.getStringExtra(Intent.EXTRA_TEXT);
        if (text == null || text.isEmpty()) return;
        String subject = intent.getStringExtra(Intent.EXTRA_SUBJECT);
        String url = getBridge().getLocalUrl() + "/?text=" + Uri.encode(text)
            + (subject != null ? "&title=" + Uri.encode(subject) : "");
        getBridge().getWebView().post(() -> getBridge().getWebView().loadUrl(url));
    }
}
