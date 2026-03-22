import React, { createContext, useContext, useMemo, useState } from 'react';
import {
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Colors, Radius, Spacing } from '@/src/theme';

type DialogAction = {
  label: string;
  onPress?: () => void | Promise<void>;
  kind?: 'default' | 'cancel' | 'destructive' | 'primary';
};

type DialogOptions = {
  title: string;
  message: string;
  actions?: DialogAction[];
};

type DialogContextValue = {
  showDialog: (options: DialogOptions) => void;
  showAlert: (title: string, message: string, actions?: DialogAction[]) => void;
};

const DialogContext = createContext<DialogContextValue | null>(null);

const defaultAction: DialogAction = { label: 'OK', kind: 'primary' };

export function DialogProvider({ children }: { children: React.ReactNode }) {
  const [dialog, setDialog] = useState<DialogOptions | null>(null);

  const closeDialog = () => setDialog(null);

  const value = useMemo<DialogContextValue>(
    () => ({
      showDialog: (options) => setDialog(options),
      showAlert: (title, message, actions) => setDialog({ title, message, actions }),
    }),
    []
  );

  const actions = dialog?.actions?.length ? dialog.actions : [defaultAction];

  const handleActionPress = async (action: DialogAction) => {
    closeDialog();
    await action.onPress?.();
  };

  return (
    <DialogContext.Provider value={value}>
      {children}
      <Modal visible={!!dialog} transparent animationType="fade" onRequestClose={closeDialog}>
        <Pressable style={styles.overlay} onPress={closeDialog}>
          <Pressable style={styles.card} onPress={(event) => event.stopPropagation()}>
            <Text style={styles.title}>{dialog?.title}</Text>
            <Text style={styles.message}>{dialog?.message}</Text>
            <View style={styles.actions}>
              {actions.map((action, index) => (
                <TouchableOpacity
                  key={`${action.label}-${index}`}
                  style={[styles.button, action.kind === 'primary' && styles.primaryButton]}
                  onPress={() => void handleActionPress(action)}
                  activeOpacity={0.85}
                >
                  <Text
                    style={[
                      styles.buttonText,
                      action.kind === 'primary' && styles.primaryButtonText,
                      action.kind === 'destructive' && styles.destructiveButtonText,
                    ]}
                  >
                    {action.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </DialogContext.Provider>
  );
}

export function useDialog() {
  const context = useContext(DialogContext);
  if (!context) {
    throw new Error('useDialog must be used within a DialogProvider');
  }
  return context;
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(26, 31, 28, 0.28)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.lg,
  },
  card: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: Colors.paper,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: Spacing.lg,
    shadowColor: Colors.black,
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.12,
    shadowRadius: 28,
    elevation: 12,
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    color: Colors.textPrimary,
    letterSpacing: -0.3,
  },
  message: {
    fontSize: 15,
    lineHeight: 22,
    color: Colors.textSecondary,
    marginTop: Spacing.sm,
  },
  actions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: Spacing.sm,
    marginTop: Spacing.lg,
  },
  button: {
    minWidth: 92,
    paddingHorizontal: Spacing.md,
    paddingVertical: 12,
    borderRadius: Radius.full,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.subtle,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryButton: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  buttonText: {
    fontSize: 15,
    fontWeight: '600',
    color: Colors.textPrimary,
  },
  primaryButtonText: {
    color: Colors.white,
  },
  destructiveButtonText: {
    color: Colors.danger,
  },
});
