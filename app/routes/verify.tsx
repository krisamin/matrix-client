import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router";
import {
  ImportRoomKeyStage,
  VerificationPhase,
  VerificationRequestEvent,
  VerifierEvent,
  type ShowSasCallbacks,
  type VerificationRequest,
} from "matrix-js-sdk/lib/crypto-api";
import { getReadyClient, setSecretInputProvider } from "../lib/matrix";

export function meta() {
  return [{ title: "기기 인증 — matrix-client" }];
}

type Step =
  | { kind: "idle" }
  | { kind: "waiting"; note: string }
  | { kind: "sas"; emojis: [string, string][]; sas: ShowSasCallbacks }
  | { kind: "done" }
  | { kind: "restoring"; progress: string }
  | { kind: "restored"; imported: number; total: number }
  | { kind: "error"; message: string };

export default function Verify() {
  const navigate = useNavigate();
  const [step, setStep] = useState<Step>({ kind: "idle" });
  const requestRef = useRef<VerificationRequest | null>(null);

  useEffect(() => {
    return () => {
      requestRef.current?.cancel().catch(() => {});
    };
  }, []);

  async function start() {
    setStep({ kind: "waiting", note: "다른 기기(Element)에 인증 요청 보내는 중..." });
    try {
      const client = await getReadyClient()!;
      if (!client.clientRunning) client.startClient({ initialSyncLimit: 20 });
      const crypto = client.getCrypto();
      if (!crypto) throw new Error("crypto 미초기화");

      const request = await crypto.requestOwnUserVerification();
      requestRef.current = request;
      setStep({
        kind: "waiting",
        note: "Element에서 인증 요청을 수락해줘 (설정 → 세션 또는 알림 배너)",
      });

      const attachVerifier = () => {
        const verifier = request.verifier;
        if (!verifier) return;
        verifier.on(VerifierEvent.ShowSas, (sas: ShowSasCallbacks) => {
          setStep({ kind: "sas", emojis: sas.sas.emoji ?? [], sas });
        });
        verifier
          .verify()
          .then(() => setStep({ kind: "done" }))
          .catch((e: unknown) =>
            setStep({
              kind: "error",
              message: e instanceof Error ? e.message : String(e),
            }),
          );
      };

      request.on(VerificationRequestEvent.Change, () => {
        if (request.phase === VerificationPhase.Cancelled) {
          setStep({
            kind: "error",
            message: `상대방이 취소함 (${request.cancellationCode ?? "?"})`,
          });
        } else if (request.phase === VerificationPhase.Started) {
          // 상대가 SAS를 시작한 경우
          attachVerifier();
        } else if (request.phase === VerificationPhase.Done) {
          setStep({ kind: "done" });
        }
      });
    } catch (e) {
      setStep({
        kind: "error",
        message: e instanceof Error ? e.message : String(e),
      });
    }
  }

  async function restoreBackup() {
    setStep({ kind: "restoring", progress: "백업 키 확인 중..." });
    // secret storage 접근 시 보안 키(또는 passphrase)를 prompt로 입력받음
    setSecretInputProvider(async () => {
      const input = window.prompt(
        "Element에서 받은 보안 키(EsTx ...) 또는 보안 문구를 입력해:",
      );
      return input;
    });
    try {
      const client = await getReadyClient()!;
      const crypto = client.getCrypto();
      if (!crypto) throw new Error("crypto 미초기화");

      // SAS 인증 시 gossip으로 백업 키가 와있을 수 있음. 없으면 4S에서 로드.
      const key = await crypto.getSessionBackupPrivateKey();
      if (!key) {
        setStep({
          kind: "restoring",
          progress:
            "secret storage에서 백업 키 가져오는 중... (Element 쪽에서 키 공유 승인이 필요할 수 있어)",
        });
        await crypto.loadSessionBackupPrivateKeyFromSecretStorage();
      }

      await crypto.checkKeyBackupAndEnable();

      // 4S가 열린 김에 cross-signing 개인키도 가져와서 이 기기를 자기 서명
      // (이게 없으면 백업은 풀려도 기기가 '미인증'으로 남음)
      setStep({ kind: "restoring", progress: "기기 cross-signing 서명 중..." });
      await crypto.bootstrapCrossSigning({});
      await crypto.crossSignDevice(client.getDeviceId()!);

      const result = await crypto.restoreKeyBackup({
        progressCallback: (p) =>
          setStep({
            kind: "restoring",
            progress:
              p.stage === ImportRoomKeyStage.LoadKeys
                ? `키 가져오는 중... ${p.successes}/${p.total}`
                : "백업에서 키 받아오는 중...",
          }),
      });
      setStep({
        kind: "restored",
        imported: result.imported,
        total: result.total,
      });
    } catch (e) {
      setStep({
        kind: "error",
        message: `백업 복구 실패: ${e instanceof Error ? e.message : String(e)}`,
      });
    } finally {
      setSecretInputProvider(null);
    }
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-xl flex-col gap-4 p-6">
      <header className="flex items-center gap-3">
        <Link to="/" className="text-blue-500">
          ←
        </Link>
        <h1 className="text-xl font-bold">기기 인증</h1>
      </header>

      {step.kind === "idle" && (
        <>
          <p className="text-sm text-gray-600 dark:text-gray-400">
            이미 로그인된 다른 기기(Element)와 이모지 비교로 이 브라우저를
            인증해. 인증되면 키 공유를 받아서 암호화 메시지를 읽을 수 있어.
          </p>
          <div className="flex gap-2">
            <button
              className="rounded bg-blue-600 px-4 py-2 text-white"
              onClick={start}
            >
              인증 시작
            </button>
            <button
              className="rounded border border-gray-300 px-4 py-2 dark:border-gray-700"
              onClick={restoreBackup}
            >
              키 백업 복구만
            </button>
          </div>
        </>
      )}

      {step.kind === "waiting" && <p>{step.note}</p>}

      {step.kind === "sas" && (
        <div className="flex flex-col gap-4">
          <p>Element에 뜬 이모지와 같은지 확인해:</p>
          <div className="flex flex-wrap gap-3 text-center">
            {step.emojis.map(([emoji, name], i) => (
              <div key={i} className="flex w-16 flex-col items-center">
                <span className="text-3xl">{emoji}</span>
                <span className="text-xs text-gray-500">{name}</span>
              </div>
            ))}
          </div>
          <div className="flex gap-2">
            <button
              className="rounded bg-green-600 px-4 py-2 text-white"
              onClick={() => step.sas.confirm()}
            >
              일치함
            </button>
            <button
              className="rounded bg-red-600 px-4 py-2 text-white"
              onClick={() => step.sas.mismatch()}
            >
              다름
            </button>
          </div>
        </div>
      )}

      {step.kind === "done" && (
        <div className="flex flex-col gap-3">
          <p className="text-green-600">✅ 인증 완료!</p>
          <p className="text-sm text-gray-600 dark:text-gray-400">
            과거 암호화 메시지도 읽으려면 키 백업에서 복구해야 해.
          </p>
          <div className="flex gap-2">
            <button
              className="rounded bg-blue-600 px-4 py-2 text-white"
              onClick={restoreBackup}
            >
              과거 메시지 키 복구
            </button>
            <button
              className="rounded border border-gray-300 px-4 py-2 dark:border-gray-700"
              onClick={() => navigate("/")}
            >
              건너뛰고 방 목록으로
            </button>
          </div>
        </div>
      )}

      {step.kind === "restoring" && <p>{step.progress}</p>}

      {step.kind === "restored" && (
        <div className="flex flex-col gap-3">
          <p className="text-green-600">
            ✅ 키 복구 완료! ({step.imported}/{step.total}개 가져옴)
          </p>
          <button
            className="self-start rounded bg-blue-600 px-4 py-2 text-white"
            onClick={() => navigate("/")}
          >
            방 목록으로
          </button>
        </div>
      )}

      {step.kind === "error" && (
        <div className="flex flex-col gap-3">
          <p className="text-red-500">실패: {step.message}</p>
          <button
            className="self-start rounded border border-gray-300 px-4 py-2 dark:border-gray-700"
            onClick={() => setStep({ kind: "idle" })}
          >
            다시 시도
          </button>
        </div>
      )}
    </main>
  );
}
