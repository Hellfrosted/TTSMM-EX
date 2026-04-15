import { useEffect, useRef, useState } from 'react';
import { Button, Layout, Progress, Typography } from 'antd';
import { AppConfig, ModType, AppState, ModCollection, ProgressTypes, SessionMods, setupDescriptors } from 'model';
import api from 'renderer/Api';
import { CheckCircleFilled } from '@ant-design/icons';

const { Content } = Layout;
const { Text } = Typography;

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
				setupDescriptors(mods as SessionMods, appState.config.userOverrides, appState.config);
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

	return (
		<Layout style={{ minHeight: '100vh', minWidth: '100vw' }}>
			<Content style={{ backgroundColor: '#222' }}>
				<div className="e-loadholder" style={{ position: 'absolute', top: 'calc(45%)' }}>
					<div className="m-loader">
						<span className="e-text">Loading</span>
					</div>
				</div>
				<span style={{ width: 'calc(100%)', display: 'flex', justifyContent: 'center', position: 'absolute', top: 'calc(90%)' }}>
					{progressMessage ? <div>{progressMessage}</div> : null}
				</span>
				{loadError ? (
					<div
						style={{
							position: 'absolute',
							top: 'calc(58%)',
							left: '50%',
							transform: 'translateX(-50%)',
							display: 'flex',
							flexDirection: 'column',
							alignItems: 'center',
							gap: 12,
							maxWidth: '70%',
							textAlign: 'center'
						}}
					>
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
				<span style={{ width: 'calc(100%)', display: 'flex', justifyContent: 'center', position: 'absolute', top: 'calc(85%)' }}>
					<Progress
						style={{ width: 'calc(80%)' }}
						strokeColor={{
							from: '#108ee9',
							to: '#7c3bd0'
						}}
						percent={progress * 100}
						format={(percent) =>
							percent && percent >= 100 ? <CheckCircleFilled style={{ color: '#7c3bd0' }} /> : `${percent?.toFixed()}%`
						}
					/>
				</span>
			</Content>
		</Layout>
	);
}
