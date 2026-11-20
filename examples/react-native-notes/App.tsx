import "@blazetrails/activerecord/connection-adapters/expo-sqlite-adapter.js";
import { useCallback, useEffect, useState } from "react";
import { Button, FlatList, Pressable, SafeAreaView, Text, TextInput, View } from "react-native";
import { Note, Notebook } from "./app/models";
import { connect, serially } from "./lib/database";

export function App() {
  const [ready, setReady] = useState<Error | boolean>(false);
  const [notebook, setNotebook] = useState<Notebook | null>(null);

  useEffect(() => {
    serially(() => connect({ adapter: "expo-sqlite", database: "notes.db" })).then(
      () => setReady(true),
      (e: Error) => setReady(e),
    );
  }, []);

  return (
    <SafeAreaView style={{ flex: 1, padding: 16 }}>
      {ready instanceof Error ? (
        <Text selectable>{`${ready.name}: ${ready.message}\n${ready.stack ?? ""}`}</Text>
      ) : !ready ? (
        <Text>Migrating…</Text>
      ) : notebook ? (
        <Notes notebook={notebook} onBack={() => setNotebook(null)} />
      ) : (
        <Notebooks onOpen={setNotebook} />
      )}
    </SafeAreaView>
  );
}

function report(error: unknown) {
  console.error(error);
}

function Notebooks({ onOpen }: { onOpen: (n: Notebook) => void }) {
  const [notebooks, setNotebooks] = useState<Notebook[]>([]);
  const [name, setName] = useState("");
  const [errors, setErrors] = useState<(string | null)[]>([]);

  const reload = useCallback(async () => {
    setNotebooks(await serially(() => Notebook.order("name").toArray()));
  }, []);
  useEffect(() => {
    reload().catch(report);
  }, [reload]);

  const create = async () => {
    const notebook = new Notebook({ name });
    if (await serially(() => notebook.save())) {
      setName("");
      setErrors([]);
      await reload();
    } else {
      setErrors(notebook.errors.fullMessages);
    }
  };

  return (
    <View style={{ flex: 1, gap: 8 }}>
      <Text style={{ fontSize: 24 }}>Notebooks</Text>
      <TextInput placeholder="New notebook" value={name} onChangeText={setName} />
      <Button title="Create notebook" onPress={() => create().catch(report)} />
      {errors.map((e, i) => (
        <Text key={i} style={{ color: "red" }}>
          {e}
        </Text>
      ))}
      <FlatList
        data={notebooks}
        keyExtractor={(n) => String(n.id)}
        renderItem={({ item }) => (
          <Pressable onPress={() => onOpen(item)}>
            <Text style={{ fontSize: 18, paddingVertical: 8 }}>{item.name}</Text>
          </Pressable>
        )}
      />
    </View>
  );
}

function Notes({ notebook, onBack }: { notebook: Notebook; onBack: () => void }) {
  const [notes, setNotes] = useState<Note[]>([]);
  const [title, setTitle] = useState("");

  const reload = useCallback(async () => {
    setNotes(
      await serially(() => notebook.notes.order({ pinned: "desc", createdAt: "desc" }).toArray()),
    );
  }, [notebook]);
  useEffect(() => {
    reload().catch(report);
  }, [reload]);

  const create = async () => {
    await serially(() => notebook.notes.createBang({ title }));
    setTitle("");
    await reload();
  };
  const togglePin = async (note: Note) => {
    await serially(() => note.updateBang({ pinned: !note.pinned }));
    await reload();
  };
  const destroyNotebook = async () => {
    await serially(() => notebook.destroy());
    onBack();
  };

  return (
    <View style={{ flex: 1, gap: 8 }}>
      <Button title="‹ Notebooks" onPress={onBack} />
      <Text style={{ fontSize: 24 }}>{notebook.name}</Text>
      <TextInput placeholder="New note" value={title} onChangeText={setTitle} />
      <Button
        title="Add note"
        onPress={() => create().catch(report)}
        disabled={title.trim() === ""}
      />
      <FlatList
        data={notes}
        keyExtractor={(n) => String(n.id)}
        renderItem={({ item }) => (
          <Pressable onPress={() => togglePin(item).catch(report)}>
            <Text style={{ fontSize: 18, paddingVertical: 8 }}>
              {item.pinned ? "📌 " : ""}
              {item.title}
            </Text>
          </Pressable>
        )}
      />
      <Button title="Delete notebook" color="red" onPress={() => destroyNotebook().catch(report)} />
    </View>
  );
}
