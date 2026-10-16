package com.squad.sound;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(MusicScannerPlugin.class);
        registerPlugin(SquadUpdaterPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
