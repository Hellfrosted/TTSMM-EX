import { useCallback, useEffect, useRef, useState } from 'react';
import { Layout, Button, Typography, Row, Col } from 'antd';
import { CheckOutlined, CloseOutlined, Loading3QuartersOutlined } from '@ant-design/icons';
import api from 'renderer/Api';
import logo_steamworks from '../../../../assets/logo_steamworks.svg';
import { useAppState } from 'renderer/state/app-state';
import { getStoredViewPath } from 'renderer/util/view-path';

const { Content } = Layout;
const { Text } = Typography;

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
			return <Loading3QuartersOutlined spin style={{ fontSize: 70, margin: 2.5, color: 'rgb(51,255,255)' }} />;
		}
		if (error) {
			return <CloseOutlined style={{ fontSize: 75, color: 'red' }} />;
		}
		return <CheckOutlined style={{ fontSize: 75, color: 'rgb(51,255,51)' }} />;
	}

	function verify() {
		setError(undefined);
		setVerifying(true);
		void api.steamworksInited().then(processVerificationMessage).catch((error) => {
			api.logger.error(error);
			processVerificationFailure(error);
		});
	}

	return (
		<Layout>
			<Content style={{ backgroundColor: '#222' }}>
				<div
					style={{
						display: 'flex',
						flexDirection: 'column',
						justifyContent: 'center',
						height: '100vh'
					}}
				>
					<Row key="steamworks" justify="center" align="bottom" gutter={16}>
						<Col key="status">{getStatusIcon()}</Col>
						<Col key="logo">
							<img src={logo_steamworks} width={500} alt="" key="steamworks" />
						</Col>
					</Row>
					{error ? (
						<Row key="error" justify="center" style={{ marginTop: '16px' }}>
							<Text code type="danger">
								{error}
							</Text>
						</Row>
					) : null}
					{error ? (
						<Row key="retry" justify="center" style={{ margin: '16px' }}>
							<Button type="primary" onClick={verify} loading={verifying}>
								Retry Steamworks Initialization
							</Button>
						</Row>
					) : null}
				</div>
			</Content>
		</Layout>
	);
}
