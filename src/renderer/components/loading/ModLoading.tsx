import { useEffect, useRef, useState } from 'react';
import { Button, Layout, Progress, Space, Typography } from 'antd';
import { AppConfig, ModType, AppState, ModCollection, ProgressTypes, SessionMods, setupDescriptors } from 'model';
import api from 'renderer/Api';
import { APP_THEME_COLORS } from 'renderer/theme';
import CheckCircleFilled from '@ant-design/icons/es/icons/CheckCircleFilled';
import CloseCircleFilled from '@ant-design/icons/es/icons/CloseCircleFilled';
import Loading3QuartersOutlined from '@ant-design/icons/es/icons/Loading3QuartersOutlined';

const { Content } = Layout;
const { Paragraph, Text, Title } = Typography;

interface ModLoadingProps {
	appState: AppState;
	modLoadCompleteCallback: () => void;
}

export default function ModLoadingComponent({ appState, modLoadCompleteCallback }: ModLoadingProps) {
	const [progress, setProgress] = useState(0);
	const [progressMessage, setProgressMessage] = useState('Counting mods');
	const [loadError, setLoadError] = useState<string>();
	const [retryCount, setRetryCount] = useState(0);
	const loadRequestIdRef = useRef(0);

	useEffect(() => {
		const requestId = loadRequestIdRef.current + 1;
		loadRequestIdRef.current = requestId;
		const config: AppConfig = appState.config as AppConfig;
		const unsubscribeProgress = api.onProgressChange((type: ProgressTypes, nextProgress: number, nextProgressMessage: string) => {
			if (loadRequestIdRef.current !== requestId) {
				return;
			}
			if (type === ProgressTypes.MOD_LOAD) {
				api.logger.silly(`Mod loading progress: ${nextProgress}`);
				setProgress(nextProgress);
				setProgressMessage(nextProgressMessage);
			}
		});

		const allKnownMods: Set<string> = appState.forceReloadMods
			? new Set<string>()
			: new Set(
					[...appState.allCollections.values()]
						.map((value: ModCollection) => value.mods)
						.flat()
				);
		allKnownMods.add(`${ModType.WORKSHOP}:${config.workshopID}`);

		void api
			.readModMetadata(config.localDir, allKnownMods)
			.then((mods) => {
				if (loadRequestIdRef.current !== requestId) {
					return mods;
				}
				setupDescriptors(mods as SessionMods, appState.config.userOverrides);
				appState.updateState({
					mods,
					firstModLoad: true,
					loadingMods: false,
					forceReloadMods: false
				});
				modLoadCompleteCallback();
				return mods;
			})
			.catch((error) => {
				if (loadRequestIdRef.current !== requestId) {
					return;
				}
				api.logger.error(error);
				setLoadError(error instanceof Error ? error.message : String(error));
			});

		return () => {
			unsubscribeProgress();
			if (loadRequestIdRef.current === requestId) {
				loadRequestIdRef.current += 1;
			}
		};
	}, [appState, modLoadCompleteCallback, retryCount]);

	const progressPercent = Math.min(100, Math.max(0, Math.round(progress * 100)));
	const statusLabel = loadError ? 'Mod scan needs attention' : progressPercent >= 100 ? 'Mod scan complete' : 'Scanning installed mods';
	const statusDetail = loadError ? 'Fix the error below and retry the scan.' : progressMessage || 'Counting mods';
	const statusIcon = loadError ? (
		<CloseCircleFilled style={{ fontSize: 32, color: APP_THEME_COLORS.error }} />
	) : progressPercent >= 100 ? (
		<CheckCircleFilled style={{ fontSize: 32, color: APP_THEME_COLORS.success }} />
	) : (
		<Loading3QuartersOutlined spin style={{ fontSize: 32, color: APP_THEME_COLORS.primary }} />
	);

	return (
		<Layout className="StartupShell">
			<Content className="StartupContent">
				<section aria-labelledby="mod-loading-title" className="StartupCard">
					<Text type="secondary">Startup</Text>
					<Title id="mod-loading-title" level={2} style={{ marginTop: 10, marginBottom: 8 }}>
						Scanning your mods
					</Title>
					<Paragraph className="StartupIntro">
						Refreshing local and workshop metadata before the collection workspace opens.
					</Paragraph>
					<div aria-live="polite" role="status" className={`StartupStatusCard${loadError ? ' is-error' : ''}`}>
						<Space size={14} align="start">
							<span aria-hidden>{statusIcon}</span>
							<span>
								<Text strong className="StartupStatusTitle">
									{statusLabel}
								</Text>
								<Text className="StartupStatusDetail">{statusDetail}</Text>
							</span>
						</Space>
					</div>
					<Progress
						className="StartupProgress"
						strokeColor={APP_THEME_COLORS.primary}
						railColor={APP_THEME_COLORS.border}
						percent={progressPercent}
						status={loadError ? 'exception' : progressPercent >= 100 ? 'success' : 'active'}
						format={(percent) =>
							percent && percent >= 100 ? <CheckCircleFilled style={{ color: APP_THEME_COLORS.success }} /> : `${percent?.toFixed()}%`
						}
					/>
					{loadError ? (
						<div className="StartupActions">
							<Text code type="danger">
								{loadError}
							</Text>
							<Button
								type="primary"
								onClick={() => {
									setLoadError(undefined);
									setProgress(0);
									setProgressMessage('Counting mods');
									setRetryCount((current) => current + 1);
								}}
							>
								Retry Mod Scan
							</Button>
						</div>
					) : null}
				</section>
			</Content>
		</Layout>
	);
}
