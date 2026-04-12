import { useCallback, useEffect, useRef, useState } from 'react';
import { Layout, Button, Typography, Row, Col } from 'antd';
import { CheckOutlined, CloseOutlined, Loading3QuartersOutlined } from '@ant-design/icons';
import api from 'renderer/Api';
import logo_steamworks from '../../../../assets/logo_steamworks.svg';
import { useAppState } from 'renderer/state/app-state';

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
	const timeoutIdsRef = useRef<number[]>([]);

	useEffect(() => {
		appStateRef.current = appState;
	}, [appState]);

	const scheduleTimeout = useCallback((callback: () => void, delay: number) => {
		const timeoutId = window.setTimeout(() => {
			timeoutIdsRef.current = timeoutIdsRef.current.filter((id) => id !== timeoutId);
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

		const nextConfig = {
			...config,
			currentPath: '/collections/main'
		};
		updateState({ config: nextConfig });
		navigate(nextConfig.currentPath);
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

	useEffect(() => {
		void api.steamworksInited().then(processVerificationMessage).catch(api.logger.error);
		return () => {
			timeoutIdsRef.current.forEach((timeoutId) => {
				window.clearTimeout(timeoutId);
			});
			timeoutIdsRef.current = [];
		};
	}, [processVerificationMessage]);

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
		setVerifying(true);
		void api.steamworksInited().then(processVerificationMessage).catch(api.logger.error);
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
