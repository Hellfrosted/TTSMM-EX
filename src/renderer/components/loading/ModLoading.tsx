import { useEffect, useState } from 'react';
import { Layout, Progress } from 'antd';
import { AppConfig, ModType, AppState, ModCollection, ProgressTypes, SessionMods, setupDescriptors } from 'model';
import api from 'renderer/Api';
import { CheckCircleFilled } from '@ant-design/icons';

const { Content } = Layout;

interface ModLoadingProps {
	appState: AppState;
	modLoadCompleteCallback: () => void;
}

export default function ModLoadingComponent({ appState, modLoadCompleteCallback }: ModLoadingProps) {
	const [progress, setProgress] = useState(0);
	const [progressMessage, setProgressMessage] = useState('Counting mods');

	useEffect(() => {
		const config: AppConfig = appState.config as AppConfig;
		const unsubscribeProgress = api.onProgressChange((type: ProgressTypes, nextProgress: number, nextProgressMessage: string) => {
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
				if (!mods) {
					appState.updateState({
						loadingMods: false,
						forceReloadMods: false
					});
					return null;
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
				api.logger.error(error);
				appState.updateState({
					loadingMods: false,
					forceReloadMods: false
				});
			});

		return () => {
			unsubscribeProgress();
		};
	}, [appState, modLoadCompleteCallback]);

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
