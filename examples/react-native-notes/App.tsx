import "@blazetrails/activerecord/connection-adapters/sqlite3-adapter.js";
import { useCallback, useEffect, useState } from "react";
import { Button, FlatList, Pressable, SafeAreaView, Text, TextInput, View } from "react-native";
import { Notebook } from "./app/models";
import { connect, serially } from "./lib/database";

type Boot = { state: "migrating" } | { state: "ready" } | { state: "failed"; error: Error };

export function App() {
  const [boot, setBoot] = useState<Boot>({ state: "migrating" });
  const [notebook, setNotebook] = useState<Notebook | null>(null);

  useEffect(() => {
    serially(() => connect({ adapter: "expo-sqlite", database: "notes.db" })).then(
      () => setBoot({ state: "ready" }),
      (error: Error) => setBoot({ state: "failed", error }),
    );
  }, []);

  return (
    <SafeAreaView style={{ flex: 1, padding: 16 }}>
      {boot.state === "failed" ? (
        <Text
          selectable
        >{`${boot.error.name}: ${boot.error.message}\n${boot.error.stack ?? ""}`}</Text>
      ) : boot.state === "migrating" ? (
        <Text>Migrating…</Text>
      ) : notebook ? (
        <Notes notebook={notebook} onBack={() => setNotebook(null)} />
      ) : (
        <Notebooks onOpen={setNotebook} />
      )}
    </SafeAreaView>
  );
}

function useQuery<T>(query: () => Promise<T[]>) {
  const [rows, setRows] = useState<T[]>([]);
  const [error, setError] = useState<string | null>(null);

  const run = useCallback(
    (action?: () => Promise<unknown>) => {
      serially(async () => {
        if (action) await action();
        return query();
      }).then(
        (result) => {
          setRows(result);
          setError(null);
        },
        (e: unknown) => setError(String(e)),
      );
    },
    [query],
  );
  useEffect(() => run(), [run]);

  return { rows, error, run, fail: (e: unknown) => setError(String(e)) };
}

function Errors({ messages }: { messages: (string | null)[] }) {
  return messages
    .filter((message) => message != null)
    .map((message, i) => (
      <Text key={i} style={{ color: "red" }}>
        {message}
      </Text>
    ));
}

function Notebooks({ onOpen }: { onOpen: (n: Notebook) => void }) {
  const { rows, error, run } = useQuery(useCallback(() => Notebook.order("name").toArray(), []));
  const [name, setName] = useState("");
  const [invalid, setInvalid] = useState<(string | null)[]>([]);

  const create = () =>
    run(async () => {
      const notebook = new Notebook({ name });
      if (await notebook.save()) {
        setName("");
        setInvalid([]);
      } else {
        setInvalid(notebook.errors.fullMessages);
      }
    });

  return (
    <View style={{ flex: 1, gap: 8 }}>
      <Text style={{ fontSize: 24 }}>Notebooks</Text>
      <TextInput placeholder="New notebook" value={name} onChangeText={setName} />
      <Button title="Create notebook" onPress={create} />
      <Errors messages={[...invalid, error]} />
      <FlatList
        data={rows}
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
  const { rows, error, run, fail } = useQuery(
    useCallback(
      () => notebook.notes.order({ pinned: "desc", created_at: "desc" }).toArray(),
      [notebook],
    ),
  );
  const [title, setTitle] = useState("");

  const create = () =>
    run(async () => {
      await notebook.notes.createBang({ title });
      setTitle("");
    });
  const destroyNotebook = () => {
    serially(() => notebook.destroy()).then(onBack, fail);
  };

  return (
    <View style={{ flex: 1, gap: 8 }}>
      <Button title="‹ Notebooks" onPress={onBack} />
      <Text style={{ fontSize: 24 }}>{notebook.name}</Text>
      <TextInput placeholder="New note" value={title} onChangeText={setTitle} />
      <Button title="Add note" onPress={create} disabled={title.trim() === ""} />
      <Errors messages={[error]} />
      <FlatList
        data={rows}
        keyExtractor={(n) => String(n.id)}
        renderItem={({ item }) => (
          <Pressable onPress={() => run(() => item.updateBang({ pinned: !item.pinned }))}>
            <Text style={{ fontSize: 18, paddingVertical: 8 }}>
              {item.pinned ? "📌 " : ""}
              {item.title}
            </Text>
          </Pressable>
        )}
      />
      <Button title="Delete notebook" color="red" onPress={destroyNotebook} />
    </View>
  );
}
