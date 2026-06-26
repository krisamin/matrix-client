import {
  ImportRoomKeyStage,
  type ShowSasCallbacks,
  VerificationPhase,
  type VerificationRequest,
  VerificationRequestEvent,
  VerifierEvent,
} from "matrix-js-sdk/lib/crypto-api";
import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router";
import { useT } from "../lib/i18n";
import {
  ensureStarted,
  getReadyClient,
  setSecretInputProvider,
} from "../lib/matrix";

export function meta() {
  return [{ title: "Verify — matrix-client" }];
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
  const t = useT();
  const navigate = useNavigate();
  const [step, setStep] = useState<Step>({ kind: "idle" });
  const requestRef = useRef<VerificationRequest | null>(null);

  useEffect(() => {
    return () => {
      requestRef.current?.cancel().catch(() => {});
    };
  }, []);

  async function start() {
    setStep({
      kind: "waiting",
      note: "다른 기기로 인증 요청을 보내는 중...",
    });
    try {
      const client = await getReadyClient()!;
      if (!client.clientRunning) ensureStarted(client);
      const crypto = client.getCrypto();
      if (!crypto) throw new Error("암호화 모듈이 초기화되지 않았습니다");

      const request = await crypto.requestOwnUserVerification();
      requestRef.current = request;
      setStep({
        kind: "waiting",
        note: "다른 기기에서 인증 요청을 수락해 주세요 (설정 → 세션 또는 알림 배너)",
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
            message: `상대 기기에서 인증이 취소되었습니다 (${request.cancellationCode ?? "?"})`,
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
        "보안 키(EsTx ...) 또는 보안 문구를 입력하세요:",
      );
      return input;
    });
    try {
      const client = await getReadyClient()!;
      const crypto = client.getCrypto();
      if (!crypto) throw new Error("암호화 모듈이 초기화되지 않았습니다");

      // SAS 인증 시 gossip으로 백업 키가 와있을 수 있음. 없으면 4S에서 로드.
      const key = await crypto.getSessionBackupPrivateKey();
      if (!key) {
        setStep({
          kind: "restoring",
          progress:
            "백업 키를 가져오는 중... (다른 기기에서 키 공유 승인이 필요할 수 있습니다)",
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
    <main className="flex min-h-dvh items-start justify-center bg-bg-0 p-6">
      <div className="flex w-[480px] max-w-full flex-col overflow-hidden rounded-md border border-line bg-bg-1 shadow-2xl">
        <header className="flex h-12 items-center gap-3 border-b border-line pl-5 pr-3">
          <Link
            to="/"
            className="text-fg-3 hover:text-fg-0"
            aria-label={t("common.cancel")}
          >
            ←
          </Link>
          <h1 className="flex-1 font-semibold text-fg-0">
            {t("verify.title")}
          </h1>
        </header>

        {step.kind === "idle" && (
          <>
            <p className="border-b border-line px-5 py-4 text-[13px] leading-relaxed text-fg-2">
              {t("verify.idleHint")}
            </p>
            <div className="flex border-t border-line">
              <button
                type="button"
                className="flex-1 border-r border-line py-2.5 text-[13px] text-fg-2 hover:bg-bg-2 hover:text-fg-0"
                onClick={restoreBackup}
              >
                {t("verify.restoreOnly")}
              </button>
              <button
                type="button"
                className="flex-1 bg-bg-2 py-2.5 text-[13px] font-medium text-fg-0 hover:bg-bg-3"
                onClick={start}
              >
                {t("verify.start")}
              </button>
            </div>
          </>
        )}

        {step.kind === "waiting" && (
          <p className="px-5 py-4 text-[13px] text-fg-2">{step.note}</p>
        )}

        {step.kind === "sas" && (
          <>
            <p className="border-b border-line px-5 py-3 text-[13px] text-fg-2">
              {t("verify.sasHint")}
            </p>
            <div className="flex flex-wrap gap-3 border-b border-line px-5 py-4">
              {step.emojis.map(([emoji, name]) => (
                <div
                  key={name}
                  className="flex w-16 flex-col items-center gap-1"
                >
                  <span className="text-3xl">{emoji}</span>
                  <span className="text-[11px] text-fg-3">{name}</span>
                </div>
              ))}
            </div>
            <div className="flex">
              <button
                type="button"
                className="flex-1 border-r border-line py-2.5 text-[13px] text-red-300 hover:bg-red-950/40"
                onClick={() => step.sas.mismatch()}
              >
                {t("verify.mismatch")}
              </button>
              <button
                type="button"
                className="flex-1 bg-bg-2 py-2.5 text-[13px] font-medium text-fg-0 hover:bg-bg-3"
                onClick={() => step.sas.confirm()}
              >
                {t("verify.match")}
              </button>
            </div>
          </>
        )}

        {step.kind === "done" && (
          <>
            <p className="border-b border-line px-5 py-3 text-[13px] font-medium text-emerald-300">
              {t("verify.done")}
            </p>
            <p className="border-b border-line px-5 py-3 text-[13px] text-fg-2">
              {t("verify.restoreHint")}
            </p>
            <div className="flex">
              <button
                type="button"
                className="flex-1 border-r border-line py-2.5 text-[13px] text-fg-2 hover:bg-bg-2 hover:text-fg-0"
                onClick={() => navigate("/")}
              >
                {t("verify.skip")}
              </button>
              <button
                type="button"
                className="flex-1 bg-bg-2 py-2.5 text-[13px] font-medium text-fg-0 hover:bg-bg-3"
                onClick={restoreBackup}
              >
                {t("verify.restoreAction")}
              </button>
            </div>
          </>
        )}

        {step.kind === "restoring" && (
          <p className="px-5 py-4 text-[13px] text-fg-2">{step.progress}</p>
        )}

        {step.kind === "restored" && (
          <>
            <p className="border-b border-line px-5 py-3 text-[13px] font-medium text-emerald-300">
              {t("verify.restored", {
                imported: step.imported,
                total: step.total,
              })}
            </p>
            <button
              type="button"
              className="bg-bg-2 py-2.5 text-[13px] font-medium text-fg-0 hover:bg-bg-3"
              onClick={() => navigate("/")}
            >
              {t("verify.home")}
            </button>
          </>
        )}

        {step.kind === "error" && (
          <>
            <p className="border-b border-line px-5 py-3 text-[13px] text-red-400">
              {t("verify.failed", { message: step.message })}
            </p>
            <button
              type="button"
              className="bg-bg-2 py-2.5 text-[13px] font-medium text-fg-0 hover:bg-bg-3"
              onClick={() => setStep({ kind: "idle" })}
            >
              {t("verify.retry")}
            </button>
          </>
        )}
      </div>
    </main>
  );
}
