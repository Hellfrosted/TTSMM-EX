import { useCallback, useEffect, useRef, useState } from 'react';
import { Layout, Button, Typography, Row, Col, Space } from 'antd';
import { CheckOutlined, CloseOutlined, Loading3QuartersOutlined } from '@ant-design/icons';
import api from 'renderer/Api';
import { APP_THEME_COLORS } from 'renderer/theme';
import logo_steamworks from '../../../../assets/logo_steamworks.svg';
import { useAppState } from 'renderer/state/app-state';
import { getStoredViewPath } from 'renderer/util/view-path';

const { Content } = Layout;
const { Paragraph, Text, Title } = Typography;

interface VerificationMessage {
	inited: boolean;
	error?: string;
}

export default function SteamworksVerification() {
	const appState = useAppState();
	const [verifying, setVerifying] = useState(true);
	const [error, setError] = useState<string>();
	const appStateRef = useRef(appState);
	const mountedRef = useRef(true);
	const timeoutIdsRef = useRef<number[]>([]);

	useEffect(() => {
		appStateRef.current = appState;
	}, [appState]);

	const scheduleTimeout = useCallback((callback: () => void, delay: number) => {
		if (!mountedRef.current) {
			return;
		}

		const timeoutId = window.setTimeout(() => {
			timeoutIdsRef.current = timeoutIdsRef.current.filter((id) => id !== timeoutId);
			if (!mountedRef.current) {
				return;
			}
			callback();
		}, delay);
		timeoutIdsRef.current.push(timeoutId);
	}, []);

	const goToConfig = useCallback(() => {
		const { config, initializedConfigs: initialized, navigate, updateState } = appStateRef.current;
		if (!initialized) {
			updateState({ initializedConfigs: true });
			navigate('/loading/config');
			return;
		}

		const nextPath = getStoredViewPath(config.currentPath);
		if (nextPath !== config.currentPath) {
			updateState({
				config: {
					...config,
					currentPath: nextPath
				}
			});
		}
		navigate(nextPath);
	}, []);

	const processVerificationMessage = useCallback((message: VerificationMessage) => {
		scheduleTimeout(() => {
			if (message.inited) {
				setError(undefined);
			} else {
				setError(message.error);
			}
			setVerifying(false);
			if (message.inited) {
				scheduleTimeout(() => {
					goToConfig();
				}, 500);
			}
		}, 100);

		return message.inited;
	}, [goToConfig, scheduleTimeout]);

	const processVerificationFailure = useCallback((cause: unknown) => {
		const message = cause instanceof Error ? cause.message : String(cause);
		scheduleTimeout(() => {
			setError(message);
			setVerifying(false);
		}, 100);
	}, [scheduleTimeout]);

	useEffect(() => {
		mountedRef.current = true;
		void api.steamworksInited().then(processVerificationMessage).catch((error) => {
			api.logger.error(error);
			processVerificationFailure(error);
		});
		return () => {
			mountedRef.current = false;
			timeoutIdsRef.current.forEach((timeoutId) => {
				window.clearTimeout(timeoutId);
			});
			timeoutIdsRef.current = [];
		};
	}, [processVerificationFailure, processVerificationMessage]);

	function getStatusIcon() {
		if (verifying) {
			return <Loading3QuartersOutlined spin style={{ fontSize: 64, color: APP_THEME_COLORS.primary }} />;
		}
		if (error) {
			return <CloseOutlined style={{ fontSize: 64, color: APP_THEME_COLORS.error }} />;
		}
		return <CheckOutlined style={{ fontSize: 64, color: APP_THEME_COLORS.success }} />;
	}

	function verify() {
		setError(undefined);
		setVerifying(true);
		void api.steamworksInited().then(processVerificationMessage).catch((error) => {
			api.logger.error(error);
			processVerificationFailure(error);
		});
	}

	const statusLabel = verifying ? 'Checking Steamworks integration' : error ? 'Steamworks initialization failed' : 'Steamworks is ready';
	const statusDetail = verifying
		? 'Confirming the manager can talk to Steam before restoring your saved workspace.'
		: error
			? 'Retry after Steam is running and the Steamworks dependencies are available on this machine.'
			: 'Continuing to your saved view.';

	return (
		<Layout className="StartupShell">
			<Content className="StartupContent">
				<section aria-labelledby="steamworks-title" className="StartupCard StartupCard--wide">
					<Row key="steamworks" justify="space-between" align="middle" gutter={[24, 24]}>
						<Col flex="1 1 340px">
							<Text type="secondary">Startup</Text>
							<Title id="steamworks-title" level={2} style={{ marginTop: 10, marginBottom: 8 }}>
								Verifying Steamworks access
							</Title>
							<Paragraph style={{ marginBottom: 0, color: APP_THEME_COLORS.textMuted }}>
								The manager checks Steamworks before loading your configuration so workshop subscriptions and launch actions stay reliable.
							</Paragraph>
						</Col>
						<Col key="logo" flex="0 0 auto" className="StartupHeroArtwork">
							<img src={logo_steamworks} width={240} alt="Steamworks logo" key="steamworks" />
						</Col>
					</Row>
					<div aria-live="polite" role="status" className={`StartupStatusCard${error ? ' is-error' : ''}`} style={{ marginTop: 24 }}>
						<Space size={14} align="start">
							<span aria-hidden>{getStatusIcon()}</span>
							<span>
								<Text strong className="StartupStatusTitle">
									{statusLabel}
								</Text>
								<Text className="StartupStatusDetail">{statusDetail}</Text>
							</span>
						</Space>
					</div>
					{error ? (
						<Row key="error" justify="start" className="StartupActions">
							<Text code type="danger">
								{error}
							</Text>
						</Row>
					) : null}
					{error ? (
						<Row key="retry" justify="start" className="StartupActions">
							<Button type="primary" onClick={verify} loading={verifying}>
								Retry Steamworks Initialization
							</Button>
						</Row>
					) : null}
				</section>
			</Content>
		</Layout>
	);
}
